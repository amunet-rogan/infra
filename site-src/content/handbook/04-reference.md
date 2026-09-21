# Reference

## Adresy

| Co | Adresa | Poznámka |
|---|---|---|
| Rozcestník | `http://amunet.tail49d1b.ts.net/` | test Tailscale |
| Seznam služeb | [`/sluzby/`](../sluzby/) | všechny služby s odkazy |
| Tahle příručka | `/pro-martina/` | |
| Tvoje nástroje | `http://amunet.tail49d1b.ts.net/sky_max/<nastroj>/` | `http`, ne `https` |
| Vaultwarden | `https://amunet.tail49d1b.ts.net:8280` | `https`, potřebuje accept-dns |
| GitHub org | [github.com/amunet-rogan](https://github.com/amunet-rogan) | veřejný internet |
| Šablona nástroje | [tool-template](https://github.com/amunet-rogan/tool-template) | |

Všechno kromě GitHubu vyžaduje **zapnutý Tailscale**.

## Užitečné příkazy

```bash
# Bezi Tailscale a vidim Amunet?
/Applications/Tailscale.app/Contents/MacOS/Tailscale status

# Zapnout Tailscale DNS (potreba pro Vaultwarden)
/Applications/Tailscale.app/Contents/MacOS/Tailscale set --accept-dns=true

# Prihlaseni ke GitHubu v poradku?
gh auth status

# Spustit nastroj lokalne
npm run dev

# Nasadit
git add . && git commit -m "zprava" && git push

# Vynutit nove nasazeni beze zmeny kodu
git commit --allow-empty -m "redeploy" && git push
```

## Řešení problémů

### Stránka se vůbec nenačte

Nejčastější příčina, v tomhle pořadí:

1. **Tailscale neběží** — ikona v menu baru, musí být *Connected*
2. **Amunet je vypnutý nebo restartuje** — napiš Jendovi
3. Zkus `Tailscale status` a podívej se, jestli je `amunet` v seznamu

### 502 Bad Gateway

nginx ví, kam nástroj patří, ale kontejner neběží. Buď se nasazení nikdy nedokončilo, nebo kontejner spadl. Zkontroluj poslední běh v **Actions** a pak napiš Jendovi.

### 404 „Tool not found"

Nástroj není zaregistrovaný v nginxu. Buď je překlep v URL, nebo Jenda ještě nespustil onboarding. Zkontroluj přesný název a napiš mu.

### Vaultwarden se jen točí

Chybí Tailscale DNS. Spusť:

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale set --accept-dns=true
```

A zkontroluj, že v adrese máš `https://` a port `8280`.

### Actions svítí červeně ❌

1. Repozitář na GitHubu → záložka **Actions**
2. Klikni na červený běh
3. Rozklikni krok, který selhal — chyba bývá na prvních řádcích
4. Zkus to vyřešit s Claude Code
5. Pokud ne, pošli Jendovi **odkaz na ten konkrétní běh**

Chyby se opravují novým pushem, ne opakovaným spouštěním starého běhu.

### `brew: command not found`

Nedokončil jsi krok 2 — dva řádky `eval`, které instalátor vypsal. Otevři nový terminál a zkus:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Pokud pomůže, přidej ten řádek do `~/.zprofile`.

## Kdy psát Jendovi

- Nový nástroj (musí ho zaregistrovat, než použiješ šablonu)
- Nové zařízení do Tailscale (musí schválit)
- 502 nebo 404 na adrese, která dřív fungovala
- Cokoliv na Amunetu vypadá odstavené
- Myslíš, že potřebuješ upravit `Dockerfile` nebo `deploy.yml`

Chyba v tvém kódu, styling, logika nástroje, přidání knihovny — to všechno zvládne Claude Code.
