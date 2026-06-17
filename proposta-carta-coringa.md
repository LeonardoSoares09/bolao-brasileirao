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

## Como funcionaria (proposta)

**Fase de grupos (3 rodadas):**
- A rodada 1 já está acabando → as cartas valem **da rodada 2 em diante**.
- Cada um recebe **2 cartas por rodada** (rodada 2 e rodada 3).
- Cada carta vai num jogo diferente (1 carta por jogo).

**Mata-mata:**
- **1 carta por fase** (32-avos, 16-avos, quartas, semi, final).

**A regra da carta:**
- Você escolhe o jogo **antes de começar** (trava no apito inicial, igual ao palpite).
- Precisa ter palpitado naquele jogo.
- **Placar exato** → pontos do jogo **dobram** (3 → 6).
- Só o resultado certo → **nada** (carta queimada, sem perder ponto).
- A carta dos outros fica **escondida** até o jogo começar (anti-cópia).
- Carta não usada **não acumula** pra próxima rodada (usa ou perde).

---

## Exemplo prático

> Rodada 2. Você tem 2 cartas.
> - Joga uma no **França × Argentina** (palpita 2×1) e outra no **Brasil × Sérvia** (palpita 3×0).
> - Brasil termina **3×0** → você cravou! Os 3 pts viram **6**. 🎉
> - França termina 2×2 → carta queimada, sem dó.
> - Saldo: **+6 a mais** na rodada, em vez de +3.

---

## Por que pode ser legal
- Dá **estratégia**: em quais jogos vale arriscar a carta?
- Cria **momentos de festa** quando alguém crava um exato dobrado.
- Mexe pouco com o que já funciona — o ranking e os palpites continuam iguais.

## Pontos de atenção (pra galera saber)
- Como dobra **só no exato**, a carta vai **falhar na maioria das vezes** (exato é raro). Isso
  é de propósito (vira aposta), mas é bom todo mundo entender pra não frustrar.
- Não muda quem tá na frente por mérito — é um bônus extra, não um "reset".

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
