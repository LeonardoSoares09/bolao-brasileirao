# 🃏 Proposta: Carta Coringa — Bolão da Copa 2026

Ideia de feature nova pra deixar o bolão mais estratégico. **Nada está decidido** — esse doc é
pra apresentar pra galera e a gente votar se quer e como funciona.

---

## A ideia em uma frase

Cada um ganha algumas **cartas coringa** por rodada/fase. Você joga uma carta num jogo: **se
cravar o PLACAR EXATO, os pontos daquele jogo DOBRAM**. Se acertar só o resultado (ou errar),
a carta não faz nada — sem castigo.

É uma **aposta de coragem**: placar exato é difícil, então gastar a carta é arriscado. Mas
quando crava, é festa.

---

## ✅ Decidido pela galera (17/06/2026)

A galera votou e fechou as regras principais. **A pontuação mudou em relação à proposta
original** — não é mais "dobra sem castigo", virou aposta de verdade (ou crava, ou não leva nada).

**Quantas cartas:**
- **Fase de grupos: 2 cartas por rodada** (cada rodada tem 24 jogos).
- **Mata-mata: 1 carta por fase.** ⚠️ *Até qual fase / quantas no total ainda não foi decidido.*

**Pontuação da carta (substitui a pontuação normal do jogo):**

| Situação | Pontos |
|---|---|
| Carta + **placar exato** | **5 pts** *(era 6 na proposta de dobrar; a galera achou muito)* |
| Carta + só o **resultado** certo | **0** — perde até o 1 pt que ganharia normal |
| Carta + errou tudo | **0** |
| **Sem** carta, exato | 3 *(regra base, não muda)* |
| **Sem** carta, resultado certo | 1 *(regra base, não muda)* |

> O ponto-chave: **usar a carta troca a pontuação normal daquele jogo pela aposta** — ou crava o
> exato e leva 5, ou não leva **nada** (mesmo acertando o resultado). É o risco que a galera topou.

**Outras regras:**
- Você escolhe o jogo **antes de começar** (trava no apito inicial, igual ao palpite).
- Precisa ter palpitado naquele jogo.
- **Carta não usada NÃO acumula** — perde a da rodada (usa ou perde).
- A carta dos outros fica **escondida** até o jogo começar (anti-cópia).

**Ainda em aberto:**
- Até qual fase do mata-mata vale a carta (e quantas no total).
- Quando estreia (rodada 2 / rodada 3 / só mata-mata).
- Se pode empilhar 2 cartas no mesmo jogo (proposta era 1 por jogo).

---

## Como funcionaria (proposta original — mantida como histórico)

**Fase de grupos (3 rodadas):**
- A rodada 1 já está acabando → as cartas valem **da rodada 2 em diante**.
- Cada um recebe **2 cartas por rodada** (rodada 2 e rodada 3).
- Cada carta vai num jogo diferente (1 carta por jogo).

**Mata-mata:**
- **1 carta por fase** (32-avos, 16-avos, quartas, semi, final).

**A regra da carta (SUPERSEDIDA pela seção acima):**
- Você escolhe o jogo **antes de começar** (trava no apito inicial, igual ao palpite).
- Precisa ter palpitado naquele jogo.
- ~~**Placar exato** → pontos do jogo **dobram** (3 → 6).~~ → virou **5 pts** (ver decisão).
- ~~Só o resultado certo → **nada** (carta queimada, sem perder ponto).~~ → agora **perde** o 1 pt.
- A carta dos outros fica **escondida** até o jogo começar (anti-cópia).
- Carta não usada **não acumula** pra próxima rodada (usa ou perde).

---

## Exemplo prático

> Rodada 2. Você tem 2 cartas.
> - Joga uma no **França × Argentina** (palpita 2×1) e outra no **Brasil × Sérvia** (palpita 3×0).
> - Brasil termina **3×0** → você cravou! Leva **5 pts** nesse jogo, em vez de 3. 🎉
> - França termina **2×2** → você até acertou que ia dar empate? Não importa: com carta,
>   sem o exato é **0**. Perdeu até o 1 pt do resultado. É o risco.
> - Saldo: **+5** num jogo, **0** no outro.

---

## Por que pode ser legal
- Dá **estratégia**: em quais jogos vale arriscar a carta?
- Cria **momentos de festa** quando alguém crava o exato e leva os 5.
- Mexe pouco com o que já funciona — o ranking e os palpites continuam iguais.

## Pontos de atenção (pra galera saber)
- Como só vale **no exato**, a carta vai **falhar na maioria das vezes** (exato é raro). Agora
  com castigo (perde o 1 pt do resultado), o risco é real — é de propósito, mas todo mundo
  tem que entender pra não frustrar.
- Não muda quem tá na frente por mérito — é um bônus arriscado, não um "reset".

---

## Design — como aparece no app (decidido 17/06/2026)

Mora tudo na aba **Palpites**, sem tela nova. Regra de ouro pensada pro **mobile**: a carta
**nunca cria espaço novo** — ou reusa pixel vazio, ou pega carona em algo que já existe.

**Onde se joga a carta:** uma **linha discreta, largura cheia, logo abaixo do "SEU PALPITE"**
do jogo selecionado:

```
┌────────────────────────────────┐
│ SEU PALPITE                     │
│ 🇧🇷 Brasil  [3]:[0]  Sérvia 🇷🇸 │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│      🃏  jogar carta aqui       │ ← a linha inteira é o botão (bom alvo de toque)
└────────────────────────────────┘
```

- A linha **só renderiza** quando faz sentido: jogo aberto (não começou) **e** você ainda tem
  carta. Jogo travado/encerrado ou cartas zeradas → some. ~90% do tempo a tela fica igual à de hoje.
- É **uma linha só na tela inteira** (no seu palpite), não repete por participante → não vira rolagem.
- **Micro-confirm inline** antes de jogar (não é modal), porque a carta trava no apito e é
  dobra-ou-nada — evita toque acidental:
  `🃏 Dobrar pontos neste jogo?  [ confirmar ]  [ não ]`

**Saldo de cartas:** decidido **não** poluir a barra de 5 abas. O saldo aparece dentro da
própria aba Palpites (não alarga/desalinha as abas no celular).

**Vocabulário visual (anti-"árvore de natal"):** a feature inteira usa **um glifo só, o 🃏, no
dourado que o app já tem** (`#ffc53d` do confete / pódio-ouro). Nenhuma cor nova.
- Carta dos outros: um 🃏 pequeno **antes do nome** na linha da galera, só pra quem usou
  (revelado no apito, como os palpites). Não adiciona altura.
- Festa do exato: acontece **só em jogo encerrado**, onde a pontuação já aparece hoje — o número
  vira `🎯 5 pts` com um 🃏. Não nasce linha nova.

> Implementação (quando for a hora): a lógica de pontos entra no `ranking.js` (fonte única de
> `PTS_EXATO`/`PTS_RESULTADO` e `pontosDoPalpite`). Precisa de coluna de carta por palpite/jogo
> no banco + endpoint pra jogar/tirar a carta (travando no apito, como `/api/palpite` já faz).

---

## ❓ Perguntas pra galera

### Parte 1 — Vocês querem essa feature?
1. **No geral, curtiram a ideia da Carta Coringa?** (sim / não / talvez)
2. Acham que deixa o bolão **mais divertido** ou **complica demais**?
3. Preferem **manter o bolão simples** como está, ou topam essa camada extra de estratégia?

### Parte 2 — Se sim, como deve funcionar?
4. **Quantas cartas por rodada de grupos?** → 1 ou 2?
5. **Dobrar só no placar exato** (proposta), ou acham muito difícil e preferem que **acerto de
   resultado também dê algo** (ex: resultado certo com carta = +1 extra)?
6. **Carta sem castigo** (proposta) ou topam **risco** (ex: se errar tudo no jogo da carta,
   perde X pontos)? — deixa mais tenso.
7. **Carta não acumula** entre rodadas (proposta) ou pode **guardar** pra usar depois?
8. **As 2 cartas em jogos diferentes** (proposta) ou poderia **empilhar as 2 no mesmo jogo**
   (dobro do dobro = 4×)?
9. No **mata-mata**, **1 carta por fase** tá bom, ou querem mais?
10. **Quando estrear?** Rodada 2 (bem em cima) / rodada 3 / só no mata-mata?

### Parte 3 — Ideias extras (opcional)
11. Alguém quer **outro tipo de carta**? (ex: carta que protege de um zero, carta que vale
    em qualquer acerto mas dá menos, etc.) — por enquanto só pensamos na de dobrar no exato.

---

## Sobre prazo (pra alinhar expectativa)
A rodada 2 vem em poucos dias. Dá pra construir com segurança, mas **sem rushar**: o mais
tranquilo é estrear na **rodada 3** ou já numa fase do mata-mata. Feature em app ao vivo a
gente faz com calma e testada.

> Depois que a galera decidir, isso vira o plano técnico de verdade (o que muda no banco, na
> API e na tela). A lógica de pontos entra no `ranking.js`, que já está organizado e testado.
