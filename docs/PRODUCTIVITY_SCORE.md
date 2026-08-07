# Score de produtividade TimeWatcher v1.0

## Objetivo

O score resume sinais de trabalho digital em uma escala de 0 a 100. Ele não
mede valor humano, qualidade da entrega ou desempenho disciplinar. Deve ser
usado como indicador operacional para encontrar padrões que merecem contexto.

O score é sempre apresentado junto com a cobertura dos dados e a confiança da
leitura. Ausência de coleta não é interpretada silenciosamente como baixa
produtividade.

## Componentes

| Componente | Peso | Cálculo |
| --- | ---: | --- |
| Aplicações | 30% | Produtivo = 100, neutro = 50, não produtivo = 0, ponderado pelo tempo |
| URLs | 20% | Mesma regra, usando domínio/página e a classificação do tenant |
| Jornada | 25% | Tempo ativo dentro da jornada dividido pelo tempo esperado, limitado a 100 |
| Utilização | 15% | Tempo ativo dividido pelo tempo monitorado |
| Interação | 10% | Presença de amostras e taxa de teclado/cliques por hora ativa, com saturação |

A saturação da interação evita que digitar ou clicar artificialmente aumente a
nota indefinidamente. Leitura, reuniões e tarefas criativas não são penalizadas
apenas por terem menos cliques, pois interação representa somente 10%.

## Classificação e nota-base

Para aplicações e URLs:

```text
qualidade = (tempo_produtivo + 0,5 × tempo_neutro) / tempo_classificado × 100
```

A nota-base é a média ponderada dos componentes disponíveis. Um componente sem
base não entra como zero nessa primeira média; sua ausência aparece na
cobertura e no ajuste de confiança.

## Cobertura e dados ausentes

Cobertura dos sinais:

- aplicações: 30%;
- ociosidade/AFK: 15%;
- URLs: 15%;
- teclado e mouse: 15%;
- jornada configurada: 25%.

O ajuste final é deliberadamente limitado:

```text
score_final = nota_base × (0,75 + 0,25 × cobertura/100)
```

Assim, a falta de coleta reduz a nota, mas não transforma automaticamente uma
pessoa em improdutiva. Menos de 15 minutos monitorados ou cobertura abaixo de
45% gera uma leitura provisória. A interface mostra quais sinais faltam.

## Consolidação por OU e organização

O score de uma OU é a média dos scores individuais ponderada pela jornada
esperada. Quando não existe jornada, usa-se o tempo monitorado. Pessoas com
jornada e sem telemetria entram no consolidado com cobertura baixa, tornando a
falha de coleta visível. A organização usa a mesma regra sobre todas as pessoas
visíveis conforme RBAC.

## Interpretação sugerida

- 0–39: baixa evidência operacional ou forte desvio;
- 40–59: atenção;
- 60–74: operação equilibrada;
- 75–89: alta consistência;
- 90–100: consistência excepcional, revisar também a sustentabilidade da jornada.

Sempre verificar cobertura, período, função, jornada e classificações antes de
tomar uma decisão. O score não deve ser usado isoladamente para punição,
promoção ou desligamento.
