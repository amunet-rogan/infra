# Mapa

{{PARTIAL:topology}}

## Amunet

Synology **DS920+** — NAS (síťové úložiště) stojící fyzicky u Jendy doma. Běží na něm zhruba třicet dockerových kontejnerů: fotky, hesla, DNS, git, zálohy a mimo jiné i tvoje nástroje.

Je to jeden fyzický stroj. Když je vypnutý nebo restartuje, nefunguje nic z toho, co je tady popsané.

## Tailscale

Nejdůležitější kus. Tailscale je **privátní šifrovaná síť** mezi našimi zařízeními — Mac, telefon, NAS. Funguje odkudkoliv, přes jakoukoliv Wi-Fi.

Klíčové pochopení: **nic z Amunetu není na veřejném internetu.** Adresy typu `amunet.tail49d1b.ts.net` neexistují pro nikoho jiného. Je to bezpečné, ale znamená to:

- Bez zapnutého Tailscale ti žádná z těch adres nenačte.
- Když ti něco přestane jít, první otázka vždy zní: *běží Tailscale?*

Naše síť (tailnet) se jmenuje `tail49d1b.ts.net`. Amunet v ní má jméno `amunet.tail49d1b.ts.net` a IP `100.70.180.58`.

## amunet-rogan

Tvoje pískoviště. Oddělený systém pro malé webové nástroje, aby ses nemusel dotknout Jendovy ostatní infrastruktury (a nemohl ji rozbít).

Skládá se ze tří věcí:

- **GitHub org `amunet-rogan`** — tady žije kód. Každý nástroj je vlastní repozitář.
- **`tool-template`** — šablona, ze které nový nástroj vyrobíš jedním kliknutím.
- **runner na Amunetu** — po každém `git push` sestaví kontejner a nasadí ho.

Tvoje nástroje běží na adresách:

```
http://amunet.tail49d1b.ts.net/sky_max/<nazev-nastroje>/
```

`sky_max` je tvůj prefix. Kdyby později přibyl další člověk, má vlastní.

## Vaultwarden (Bitwarden)

Self-hostovaný trezor hesel. Server běží na Amunetu, ale připojuješ se k němu **normální oficiální aplikací Bitwarden** — jen jí v nastavení řekneš, ať místo cloudu mluví s naším serverem.

```
https://amunet.tail49d1b.ts.net:8280
```

Sem patří hesla a hlavně **API tokeny** k nástrojům (Meta, Instagram apod.). Nikdy je nedávej přímo do kódu — kód jde na GitHub, trezor ne.

Pozor: tahle adresa je `https` (na rozdíl od nástrojů) a potřebuje zapnuté Tailscale DNS.

## AdGuard Home

Blokuje reklamy a trackery na úrovni DNS pro všechna zařízení v tailnetu. Nemusíš ho nijak nastavovat — jen vědět, že existuje, protože je to zároveň **DNS server celé sítě**. Když je Amunet dole, nemusí se ti překládat jména.

## GitHub CLI (`gh`)

Nástroj v terminálu pro práci s GitHubem. Potřebuješ ho hlavně kvůli přihlášení — jednou se autentizuješ a `git push` pak funguje bez ptaní na heslo.
