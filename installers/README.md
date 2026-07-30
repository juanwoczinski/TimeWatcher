# Instaladores TimeWatcher

- `macos/build-pkg.sh`: gera o PKG universal de distribuição. No primeiro uso,
  o agente solicita o código temporário criado no console e passa a pertencer ao
  tenant correto.
- `windows/Product.wxs`: fonte do MSI x64. O workflow `Build Windows MSI`
  compila e publica o artefato no GitHub Actions.

Para produção externa, ambos os pacotes ainda devem receber assinatura de
código. O macOS exige certificado Developer ID e notarização; o Windows exige
certificado Authenticode. O PKG local é assinado ad-hoc para homologação.
