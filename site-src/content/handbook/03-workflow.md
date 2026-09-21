# Workflow

Jak vyrobíš a nasadíš nástroj. Po prvním průchodu to zabere pár minut.

## Nový nástroj

**1. Vymysli název.** Malá písmena, pomlčky, bez mezer a diakritiky.

| | |
|---|---|
| ✅ | `instagram-stats`, `post-scheduler`, `losovani-soutezi` |
| ❌ | `IG Stats`, `můj_nástroj!`, `Instagram Stats` |

**2. Napiš Jendovi název.** Musí nástroj zaregistrovat — přidělí mu port a vygeneruje nginx konfiguraci. Trvá to půl minuty, ale bez toho tvoje URL nebude existovat.

**3. Až potvrdí,** jdi na [tool-template](https://github.com/amunet-rogan/tool-template) → **Use this template** → **Create a new repository**:

- Owner: `amunet-rogan`
- Repository name: **přesně** ten název, co Jenda potvrdil
- Visibility: **Private**

**4. Naklonuj k sobě:**

```bash
cd ~/Projects
gh repo clone amunet-rogan/nazev-nastroje
cd nazev-nastroje
```

## Psaní a lokální testování

Otevři složku ve VS Code:

```bash
code .
```

Spusť Claude Code ve stejné složce (v terminálu, nebo v terminálu uvnitř VS Code):

```bash
claude
```

A řekni mu, co chceš. Třeba: *„Udělej z toho formulář, kam se zadá jméno soutěže a seznam účastníků, a vylosuje se výherce."*

Nástroj si pustíš lokálně:

```bash
npm run dev
```

Otevři `http://localhost:8000`. Uprav kód, ulož, obnov stránku — `--watch` restartuje server sám.

> Testuj lokálně, dokud nejsi spokojený. Nasazení není určené k ladění — každý push je plný build a trvá ~2 minuty.

## Nasazení

```bash
git add .
git commit -m "popis co jsi udelal"
git push
```

To je celé. Na GitHubu v záložce **Actions** vidíš průběh. Až jsou obě fáze zelené ✅, nástroj běží na:

```
http://amunet.tail49d1b.ts.net/sky_max/nazev-nastroje/
```

Funguje i z telefonu, pokud na něm máš zapnutý Tailscale.

## Tajné klíče a tokeny

Když nástroj potřebuje API klíč, **nikdy ho nepiš do kódu.** Kód jde na GitHub.

Místo toho:

1. Ulož si hodnotu do Bitwardenu (ať ji neztratíš)
2. Na GitHubu jdi na `https://github.com/amunet-rogan/TVUJ-REPO/settings/secrets/actions`
3. **New repository secret**
4. Name: přesně to, co ti řekne Claude — třeba `META_ACCESS_TOKEN`. **Rozlišují se velká a malá písmena.**
5. Secret: vlož hodnotu → **Add secret**

V kódu se pak čte jako `process.env.META_ACCESS_TOKEN`. Název musí sedět znak po znaku.

## Dvě pravidla

**Neupravuj `Dockerfile` ani `.github/workflows/deploy.yml`.** Ty patří Jendovi a drží nasazení pohromadě. Když si myslíš, že je potřeba je změnit, napiš mu.

**Nepoužívej „Re-run all jobs"** na starých selhaných bězích. Sestaví to *starý* kód z tehdejšího commitu a přepíše tím, co teď funguje. Když chceš zkusit znovu, pushni:

```bash
git commit --allow-empty -m "redeploy"
git push
```
