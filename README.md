# Sirius — sito aziendale e magazine

Un sito aziendale responsive in italiano, con pagine Home, Azienda, Soluzioni, Articoli e Contatti. Il design riprende il riferimento fornito: blu notte, accenti azzurri, orbite e schede arrotondate, con tema scuro e chiaro. Include magazine, modulo contatti e contatore delle visite. HTML, CSS, JavaScript e un piccolo server Node.js: nessun pacchetto esterno da installare e nessun account obbligatorio.

![Anteprima della nuova homepage Sirius in blu notte e azzurro](docs/anteprima.png)

[Visualizza l’anteprima su telefono](docs/anteprima-mobile.png).

## 1. Avvio sul tuo PC

1. Estrai **tutta** la cartella dallo ZIP, ad esempio in `Documenti/Sirius`. Non aprire il sito direttamente dentro l'archivio.
2. Installa **Node.js LTS, versione 22 o successiva**, da <https://nodejs.org/>. Chiudi e riapri il terminale dopo l'installazione.
3. Su **Windows**, fai doppio clic su `Avvia-Sirius.bat`.
4. Apri **http://localhost:3000** nel browser e lascia aperta la finestra del server. Per fermarlo premi `Ctrl+C`.

Su macOS puoi usare `Avvia-Sirius.command`. Se il sistema non lo apre, usa il terminale. Su macOS, Linux o Windows il comando universale è:

```sh
cd percorso/della/cartella/Sirius
node server.mjs
```

In alternativa funziona `npm start`. Non occorre eseguire `npm install`. Il sito ha bisogno del server: il doppio clic su `public/index.html` non attiva articoli, contatti e contatore.

Se la porta 3000 è già occupata, scegli un'altra porta:

```sh
# macOS / Linux
PORT=3001 node server.mjs
```

```powershell
# Windows PowerShell
$env:PORT=3001; node server.mjs
```

Poi apri `http://localhost:3001`.

## 2. Pubblicare gli articoli

Inserisci i file direttamente nella cartella **`fileArticoli`**, senza sottocartelle. Sono supportati **Markdown (`.md`), testo (`.txt`) e JSON (`.json`)**, codificati in UTF-8. Il sito legge la cartella a ogni richiesta: non occorre modificare il codice né riavviare il server.

La pagina controlla automaticamente gli aggiornamenti ogni 30 secondi. Puoi anche ricaricarla per vederli subito. Se stai usando filtri o una pagina successiva alla prima, torna alla prima pagina e rimuovi i filtri per vedere il nuovo contenuto.

Il sito conserva un **indice persistente degli inserimenti**: un file rilevato per la prima volta viene prima di quelli già presenti, anche se il programma di copia conserva una vecchia data di modifica. La modifica del testo di un file esistente non cambia la sua posizione. La data `date` nel file è quella mostrata al lettore e non decide l'ordine. Al primo avvio, i file già inclusi vengono ordinati per data di ultima modifica; da quel momento l'indice registra i nuovi arrivi. Conserva la cartella `data` per mantenere questa cronologia. Se aggiungi più file contemporaneamente, il server usa le date disponibili sul filesystem per stabilire l'ordine all'interno del gruppo.

Per iniziare puoi duplicare il file **`Modello-articolo.md`** nella cartella `fileArticoli`, rinominarlo e modificarne il contenuto con un editor di testo. Oppure copia questo esempio in `fileArticoli/il-mio-articolo.md`:

```markdown
---
title: Il mio primo articolo
excerpt: Una breve introduzione che incuriosisce il lettore.
category: Innovazione
topic: Intelligenza artificiale
tags: AI, impresa, futuro
date: 2026-11-04
color: "#bdb2ff"
---

# Il mio primo articolo

Questo è il testo dell'articolo. Puoi usare **grassetto**, paragrafi,
elenchi e [link](https://example.com).

## Un approfondimento

- Primo punto
- Secondo punto
```

Sono inclusi articoli dimostrativi: puoi cancellarli o sostituirli. Ogni file corrisponde a un articolo. Se ometti i metadati, il server ricava titolo e descrizione dal testo. I campi `category`, `topic` e `tags` alimentano filtri e ricerca. Per i JSON usa gli stessi campi, aggiungendo `content` con il corpo del testo. Non inserire password o dati privati negli articoli: sono pubblici.

Il magazine include:

- ordinamento dal file aggiunto più di recente;
- 10 articoli per pagina come impostazione iniziale;
- selettore da 10 a 100 articoli per pagina, a passi di 10;
- ricerca testuale e filtri per categoria e argomento;
- lettura completa e indirizzo condivisibile per ciascun articolo.

Word e PDF non sono interpretati come articoli: esporta o copia il testo in uno dei formati supportati.

## 3. Contatore delle visite

Il contatore è condiviso tra i visitatori e viene salvato sul server nella cartella `data`. Conta una visita per sessione del browser attraverso un cookie tecnico: ricaricare la pagina nella stessa sessione non aggiunge visite. Una nuova sessione può aggiungerne una.

Non rappresenta il numero di persone uniche e non è un sistema di analisi certificato: cookie bloccati, strumenti automatici e comportamenti del browser possono influire sul totale. Non vengono usati servizi di analisi esterni. La scelta del tema chiaro o scuro è salvata soltanto nel browser come preferenza tecnica. I dati restano disponibili dopo il riavvio del server; conserva la cartella `data` quando aggiorni il sito e includila nei backup.

## 4. Modulo contatti

Il modulo valida nome, email, messaggio e consenso privacy. Include un campo antispam nascosto e un limite alle richieste. Le richieste valide vengono registrate in **`data/messages.ndjson`**, un oggetto JSON per riga, leggibile con un editor di testo.

**Non vengono inviate email.** Per leggere le richieste apri quel file sul computer o server che ospita Sirius. Il file non è accessibile attraverso il sito web. Non inserire dati sensibili nei messaggi. Un eventuale invio email richiede una configurazione successiva con un servizio di posta.

## 5. Personalizzare l'azienda

- `public/index.html`: homepage, mission, impegni e ultimi articoli.
- `public/azienda.html`: identità aziendale, mission e partnership strategica.
- `public/soluzioni.html`: aree di intervento e accompagnamento al cambiamento.
- `public/articoli.html`: archivio con ricerca, filtri e paginazione.
- `public/contatti.html`: modulo per registrare una richiesta.
- Le pagine includono navigazione comune, contatore e informativa privacy.
- `public/styles.css`: colori, tipografia, impaginazione e versione mobile.
- `public/brand.css`: dimensioni del logo originale e accenti indaco/giallo, su desktop e telefono.
- `public/assets/sirius-logo.png`: file originale dell’azienda, conservato e usato nel piè di pagina, nella grafica delle orbite e come icona del sito.
- `public/assets/sirius-logo-transparent.png`: variante con fondo trasparente per il logo laterale, verticale e fisso sopra tutte le pagine. Non è inserito in una fascia o in un riquadro. La rimozione del fondo tramite generazione di immagini può introdurre lievi differenze nei contorni rispetto all’originale, che rimane disponibile separatamente.
- `public/app.js`: interazioni, magazine, modulo contatti e contatore.
- `public/effects.js`: ingresso progressivo dei riquadri durante lo scorrimento e riflesso luminoso che segue il puntatore, come nel riferimento. Gli effetti rispettano la preferenza di movimento ridotto del browser.
- `fileArticoli/`: contenuti editoriali modificabili senza programmare.
- `server.mjs`: server, API, contatore e salvataggio contatti.

La mission di Sirius è **Innovare, Semplificare e Potenziare**: introdurre tecnologie e metodologie moderne nei processi tradizionali, trasformare procedure complesse in workflow digitali efficienti e permettere a persone e organizzazioni di concentrarsi sul core business e creare valore. La presentazione comprende partnership strategica a lungo termine, centralità delle persone e change management, innovazione continua e scalabilità, sicurezza dei dati e sostenibilità attraverso la dematerializzazione. Prima dell'uso pubblico completa ragione sociale, recapiti, partita IVA se prevista, titolare del trattamento e tempi di conservazione effettivi. L'informativa inclusa descrive le funzioni tecniche del modello e va completata per l'azienda reale.

## 6. Dal PC a Internet

Avviare il sito sul PC lo rende consultabile localmente. Per renderlo pubblico serve un hosting che esegua **Node.js** e offra **spazio persistente su disco**. Carica l'intera cartella, configura HTTPS tramite l'hosting e avvia `node server.mjs` (o `npm start`). Imposta `HOST=0.0.0.0` se richiesto dalla piattaforma e `PORT` alla porta assegnata. Con HTTPS attivo, imposta anche `COOKIE_SECURE=1` per trasmettere il cookie tecnico soltanto su connessioni sicure.

GitHub può conservare il codice ma **GitHub Pages non può eseguire questo server**. Un hosting soltanto statico non supporta le funzioni dinamiche: lettura della cartella articoli, contatore condiviso e modulo contatti. Non usare dischi temporanei per la cartella `data`. Il server è pensato per una singola istanza; più istanze richiederebbero un database condiviso. Il PC non deve essere esposto direttamente a Internet per provare il progetto.

## 7. Verifica tecnica

Con Node.js installato:

```sh
npm test
```

I test usano cartelle temporanee e non modificano i tuoi articoli o contatti. Sono verificati i comportamenti del server, inclusi articoli, filtri, ordine, paginazione, conteggio e contatti.

## Note sui file

La cartella `data` viene creata automaticamente al primo avvio ed è esclusa da Git, insieme ai dati raccolti. I test e gli strumenti usati durante lo sviluppo non richiedono dipendenze per usare il sito. Per copiare il progetto su un altro PC usa tutti i file dell'archivio; per conservare visite e messaggi già raccolti, copia separatamente anche la tua cartella `data`.
