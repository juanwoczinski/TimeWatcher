using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal static class Program
{
    private const string ServerUrl = "https://timewatcher.32-193-139-223.sslip.io";
    private static readonly string LogDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "TimeWatcher");
    private static readonly string LogPath = Path.Combine(LogDirectory, "setup.log");

    [STAThread]
    private static async Task Main()
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        if (Environment.GetCommandLineArgs().Contains("--self-test"))
        {
            const string sample = "abcdefghijklmnopqrstuvwxyzABCDEFGH";
            Environment.ExitCode = EnrollmentToken($"TimeWatcher-Setup-{sample} (1).exe") == sample ? 0 : 1;
            return;
        }
        try
        {
            Directory.CreateDirectory(LogDirectory);
            var executable = Environment.ProcessPath ?? throw new InvalidOperationException("Caminho do instalador não identificado.");
            var token = EnrollmentToken(Path.GetFileName(executable));
            if (string.IsNullOrWhiteSpace(token))
                throw new InvalidOperationException("Este instalador não está vinculado a uma empresa. Baixe-o novamente pela console TimeWatcher.");

            if (!IsAdministrator())
            {
                Log("Solicitando elevação administrativa.");
                Process.Start(new ProcessStartInfo(executable) { UseShellExecute = true, Verb = "runas" });
                return;
            }

            Log("Consultando versão estável do Windows.");
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var manifestJson = await client.GetStringAsync($"{ServerUrl}/ingest/v1/windows-bootstrap");
            var manifest = JsonSerializer.Deserialize<Manifest>(manifestJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new InvalidOperationException("Manifesto de instalação inválido.");
            if (string.IsNullOrWhiteSpace(manifest.Url) || string.IsNullOrWhiteSpace(manifest.Sha256) || manifest.Sha256.Length != 64)
                throw new InvalidOperationException("Versão estável do Windows não está disponível.");

            var msiPath = Path.Combine(Path.GetTempPath(), $"TimeWatcher-Windows-{manifest.Version}.msi");
            Log($"Baixando MSI {manifest.Version}.");
            await using (var target = File.Create(msiPath))
                await (await client.GetStreamAsync($"{manifest.Url}?v={manifest.Sha256[..12]}")).CopyToAsync(target);
            var actual = Convert.ToHexString(await SHA256.HashDataAsync(File.OpenRead(msiPath))).ToLowerInvariant();
            if (!actual.Equals(manifest.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A validação de segurança SHA-256 do MSI falhou.");

            var installerLog = Path.Combine(LogDirectory, "installer.log");
            var install = new ProcessStartInfo("msiexec.exe") { UseShellExecute = false };
            install.ArgumentList.Add("/i"); install.ArgumentList.Add(msiPath);
            install.ArgumentList.Add($"SERVER_URL={ServerUrl}");
            install.ArgumentList.Add($"ENROLLMENT_TOKEN={token}");
            install.ArgumentList.Add("/passive"); install.ArgumentList.Add("/norestart");
            install.ArgumentList.Add("/L*v"); install.ArgumentList.Add(installerLog);
            Log("Executando MSI.");
            using var process = Process.Start(install) ?? throw new InvalidOperationException("Não foi possível iniciar o Windows Installer.");
            await process.WaitForExitAsync();
            if (process.ExitCode is not (0 or 3010 or 1641))
                throw new InvalidOperationException($"O Windows Installer retornou o código {process.ExitCode}.");

            var agentScript = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "TimeWatcher", "TimeWatcherAgent.ps1");
            if (!File.Exists(agentScript)) throw new FileNotFoundException("O agente não foi instalado corretamente.", agentScript);
            StopExistingAgent();
            Process.Start(new ProcessStartInfo("powershell.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                Arguments = $"-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"{agentScript}\""
            });
            Log("Agente iniciado; aguardando confirmação do servidor.");
            var registered = false;
            var deadline = DateTimeOffset.UtcNow.AddSeconds(75);
            while (DateTimeOffset.UtcNow < deadline)
            {
                await Task.Delay(TimeSpan.FromSeconds(3));
                try
                {
                    var statusJson = await client.GetStringAsync($"{ServerUrl}/ingest/v1/agent-install-status?host={Uri.EscapeDataString(Environment.MachineName)}");
                    var status = JsonSerializer.Deserialize<InstallStatus>(statusJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (status?.Registered == true) { registered = true; break; }
                }
                catch (Exception statusError) { Log($"Confirmação pendente: {statusError.Message}"); }
            }
            if (!registered)
                throw new InvalidOperationException($"O agente foi instalado, mas a estação não confirmou o primeiro envio ao servidor. Consulte {Path.Combine(LogDirectory, "agent.log")}.");
            Log("Instalação confirmada pelo servidor.");
            MessageBox.Show("TimeWatcher instalado e conectado com sucesso. Este dispositivo já está disponível na console.", "TimeWatcher", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (System.ComponentModel.Win32Exception error) when (error.NativeErrorCode == 1223)
        {
            Log("Instalação cancelada na solicitação de administrador.");
        }
        catch (Exception error)
        {
            Log($"ERRO: {error}");
            MessageBox.Show($"Não foi possível instalar o TimeWatcher.\n\n{error.Message}\n\nDiagnóstico: {LogPath}", "TimeWatcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string? EnrollmentToken(string fileName)
    {
        var match = Regex.Match(fileName, @"^TimeWatcher-Setup-(?<token>[A-Za-z0-9_-]{32,128})(?: \(\d+\))?\.exe$", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["token"].Value : null;
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void StopExistingAgent()
    {
        // A previous agent may still own the global mutex after an in-place
        // upgrade. Stop only PowerShell processes running our installed script;
        // never terminate unrelated PowerShell sessions.
        const string command = "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' OR Name='pwsh.exe'\" | Where-Object { $_.CommandLine -like '*TimeWatcherAgent.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }";
        try
        {
            using var stop = Process.Start(new ProcessStartInfo("powershell.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{command.Replace("\"", "\\\"")}\""
            });
            stop?.WaitForExit(15_000);
            Thread.Sleep(1_000);
            Log("Instâncias anteriores do agente encerradas.");
        }
        catch (Exception error) { Log($"Não foi possível encerrar a instância anterior: {error.Message}"); }
    }

    private static void Log(string message)
    {
        try { File.AppendAllText(LogPath, $"{DateTimeOffset.UtcNow:O} {message}{Environment.NewLine}"); }
        catch { }
    }

    private sealed record Manifest(string Version, string Url, string Sha256);
    private sealed record InstallStatus(bool Registered, string? LastHeartbeatAt, string? Version);
}
