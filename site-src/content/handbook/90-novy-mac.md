# Nový Mac

Odškrtávací seznam. Jdi shora dolů, každý krok má ověření. Odškrtnutí se pamatuje v prohlížeči, takže můžeš zavřít a vrátit se.

Terminál otevřeš přes <kbd>Cmd</kbd>+<kbd>mezerník</kbd> → napiš `Terminal` → <kbd>Enter</kbd>.

## 1. Tailscale

Bez tohohle nefunguje nic dalšího, takže první.

- [ ] Stáhni z [tailscale.com/download/mac](https://tailscale.com/download/mac) (nebo App Store)
- [ ] Spusť, přihlas se **stejným účtem jako na telefonu**
- [ ] V menu baru klikni na ikonu Tailscale → zkontroluj, že je *Connected*
- [ ] Jendovi napiš, že máš nové zařízení — musí ho schválit v adminu

Ověření v terminálu:

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

Měl bys v seznamu vidět `amunet`.

- [ ] Zapni Tailscale DNS (potřeba pro Vaultwarden):

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale set --accept-dns=true
```

- [ ] Otevři v prohlížeči `http://amunet.tail49d1b.ts.net/` — musí naskočit rozcestník Amunetu (citát a dva odkazy)

> Pokud se stránka nenačte, dál nepokračuj. Napiš Jendovi. Všechny další kroky na tomhle stojí.

## 2. Homebrew

Správce balíčků pro macOS. Skrz něj nainstaluješ zbytek jedním příkazem.

- [ ] Nainstaluj:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Instalátor si řekne o heslo k Macu a na konci vypíše dva řádky začínající `eval`. **Ty dva řádky musíš spustit** — jinak `brew` nepůjde. Zkopíruj je z výstupu a spusť.

- [ ] Ověř:

```bash
brew --version
```

## 3. Vývojářské nástroje

- [ ] Nainstaluj vše najednou:

```bash
brew install git gh node@24
brew install --cask visual-studio-code bitwarden
```

- [ ] Zpřístupni Node 24 v terminálu:

```bash
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

- [ ] Ověř — musí vypsat `v24.x.x`:

```bash
node --version
```

Node 24 je verze, na které běží nástroje na Amunetu. Držet se jí znamená, že co funguje u tebe, funguje i tam.

## 4. Přihlášení k GitHubu

- [ ] Spusť:

```bash
gh auth login
```

Odpovědi: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git) → **Login with a web browser**. Zobrazí se kód, zkopíruj ho, prohlížeč se otevře sám.

- [ ] Ověř:

```bash
gh auth status
```

- [ ] Nastav si jméno a mail do commitů:

```bash
git config --global user.name "Martin Tresnak"
git config --global user.email "m.tresnak@gmail.com"
```

- [ ] Zkontroluj, že je `m.tresnak@gmail.com` přidaný a ověřený na GitHubu:
  [github.com/settings/emails](https://github.com/settings/emails). Jinak se ti commity
  nepřipíšou a na GitHubu budou mít šedého anonyma místo tvého avataru.

- [ ] Zkontroluj, že vidíš org — musí vypsat seznam repozitářů:

```bash
gh repo list amunet-rogan
```

Pokud vypíše chybu o oprávnění, nemáš přijatou pozvánku do orgu → [github.com/orgs/amunet-rogan/invitation](https://github.com/orgs/amunet-rogan/invitation)

## 5. Bitwarden

Aplikace už je nainstalovaná z kroku 3. Teď ji nasměruješ na náš server.

- [ ] Otevři Bitwarden
- [ ] Na přihlašovací obrazovce klikni na **ozubené kolo** vlevo nahoře
- [ ] **Server URL** → vlož:

```
https://amunet.tail49d1b.ts.net:8280
```

- [ ] Ulož a přihlas se
- [ ] Rozšíření do prohlížeče: nainstaluj *Bitwarden Password Manager* z obchodu a nastav mu **stejnou** Server URL

> Kdyby se stránka trezoru jen točila a nenačetla — skoro vždy je to `accept-dns`. Spusť příkaz z kroku 1 a zkus znovu.

## 6. Claude Code

- [ ] Nainstaluj:

```bash
npm install -g @anthropic-ai/claude-code
```

- [ ] Spusť a přihlas se (otevře prohlížeč):

```bash
claude
```

Claude Code je asistent v terminálu — pracuje se soubory ve složce, ve které ho spustíš. Tímhle budeš psát většinu kódu nástrojů.

## 7. Hotovo — zkušební jízda

- [ ] Ověř, že vidíš běžící nástroj:

```
http://amunet.tail49d1b.ts.net/sky_max/losovani-soutezi/
```

Pokud se načte, máš kompletní řetěz: Tailscale → Amunet → nginx → kontejner. Můžeš jít na *Workflow*.
