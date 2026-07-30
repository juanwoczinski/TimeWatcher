# Plano de produto — TeamWatcher

## Direção

O TeamWatcher será uma plataforma multiempresa de inteligência sobre o uso do
tempo. Nesta fase, todos os indicadores são apresentados em duração e
percentual. Valores financeiros e gravação contínua de tela em HD ficam fora do
escopo.

## Entregue no núcleo atual

- Coleta de aplicativo e título da janela ativa.
- Tempo monitorado, ativo, ocioso, produtivo, neutro e não produtivo.
- Contagem de teclado e mouse sem registrar o conteúdo digitado.
- Inventário e estado de sincronização do dispositivo.
- Capturas periódicas mediante consentimento do usuário.
- Visões reais de resumo, pessoas, dispositivos e aplicativos. As capturas não
  são um módulo separado: pertencem ao colaborador e ao host que as originou.
- Filtros de hoje, sete dias e trinta dias.
- Sincronização offline com reenvio posterior pelo agente.
- Deploy repetível sem depender de IA.

## Fase 1 — Gestão do tempo

1. Regras de classificação por empresa, equipe e aplicativo/site.
2. Jornada planejada versus realizada, início, término e pausas excedentes.
3. Relatórios individuais, por equipe e consolidados por empresa.
4. Ranking por tempo produtivo, foco, ociosidade e aderência à jornada.
5. Mapa temporal por hora do dia e dia da semana.
6. Exportação CSV/XLSX e endpoint para Power BI.
7. Resumo diário por e-mail; WhatsApp como integração opcional.
8. Alertas configuráveis de agente offline, ociosidade longa e desvio de jornada.

## Fase 2 — SaaS multiempresa

1. Login próprio com sessão segura e recuperação de senha.
2. Papéis: administrador da plataforma, administrador da empresa, gestor e
   colaborador.
3. Isolamento obrigatório por `tenant_id` em toda consulta, arquivo e token.
4. Cadastro de empresas, equipes, colaboradores e ativos.
5. Token de provisionamento com expiração para vincular o instalador à empresa.
6. Auditoria de visualização de capturas e alterações administrativas.
7. Política de retenção e exclusão por empresa.

## Fase 3 — Distribuição do agente

1. PKG macOS assinado e notarizado, com Apple Silicon e Intel.
2. MSI Windows assinado, silencioso e compatível com Intune/GPO/RMM.
3. Atualização automática assinada e canal de versões.
4. Instalação em massa com URL da plataforma e token de provisionamento.
5. Diagnóstico local de permissões, fila offline e conectividade.

## IA econômica e embarcada

Começar com análise determinística local, sem custo por chamada: regras de
anomalia, comparação com a média móvel e geração de recomendações a partir de
modelos de texto controlados. Em seguida, usar um modelo pequeno quantizado,
executado no servidor por `llama.cpp` ou Ollama.

Modelo inicial sugerido: Qwen 2.5 1.5B/3B Instruct em Q4. A IA receberá somente
agregados de tempo e nomes de categorias, nunca imagens ou conteúdo digitado.
Uma execução diária por empresa será armazenada em cache. Perguntas no painel
consultarão primeiro métricas SQL e usarão o modelo apenas para redigir a
explicação. Isso reduz consumo de CPU, latência e qualquer gasto externo.

Casos iniciais:

- explicar quais aplicativos concentraram o tempo no dia;
- detectar mudança relevante de foco contra a média dos últimos sete dias;
- apontar pausas ou jornadas fora do padrão definido pela empresa;
- sugerir uma ação simples e mensurável para o próximo dia;
- produzir resumo diário para gestor e colaborador.

## Fora do escopo atual

- Conversão de tempo em valores monetários.
- Gravação contínua de vídeo/tela em HD ou áudio de reuniões.
- Registro do conteúdo digitado ou keylogging.
- Decisões automáticas sobre pessoas baseadas apenas em pontuação.

## Critérios de produção

- Consentimento e política transparente de monitoramento.
- Criptografia em trânsito e em repouso.
- Segregação multiempresa testada automaticamente.
- Instaladores assinados e atualizações verificadas.
- Backups, retenção, auditoria e procedimento de exclusão LGPD.
- Métricas de disponibilidade, fila de ingestão e alertas operacionais.
