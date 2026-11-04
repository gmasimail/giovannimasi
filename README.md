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

Il contatore è condiviso tra i visitatori e viene salvato sul server nella cartella `data`. Le statistiche sono facoltative per scelta progettuale: alla prima visita sono disattivate e il sito propone **Accetta statistiche** e **Rifiuta statistiche** con pari evidenza. Il sito resta utilizzabile rifiutando. Solo dopo l’accettazione viene attivato il cookie di sessione del contatore; ricaricare la pagina nella stessa sessione non aggiunge accessi. Il totale storico già presente viene conservato, mentre i nuovi accessi sono registrati soltanto con una scelta valida di accettazione.

Non rappresenta il numero di persone uniche e non è un sistema di analisi certificato: cookie bloccati, strumenti automatici e comportamenti del browser possono influire sul totale. Non vengono usati servizi di analisi esterni. La scelta del tema chiaro o scuro è salvata soltanto nel browser come preferenza tecnica. I dati restano disponibili dopo il riavvio del server; conserva la cartella `data` quando aggiorni il sito e includila nei backup.

## 4. Modulo contatti

Il modulo mostra il collegamento all’informativa prima dell’invio e valida nome, email e messaggio. Non impone un consenso generico per gestire richieste sui servizi e attività precontrattuali: il trattamento necessario a tali richieste si basa sull’art. 6, par. 1, lett. b GDPR. Include un campo antispam nascosto e un limite alle richieste. I nuovi messaggi riportano la versione dell’informativa applicata, che non è una dichiarazione di consenso né una prova di lettura. Le richieste valide vengono registrate in **`data/messages.ndjson`**, un oggetto JSON per riga, leggibile con un editor di testo.

**Non vengono inviate email.** Per leggere le richieste apri quel file sul computer o server che ospita Sirius. Il file non è accessibile attraverso il sito web. Non inserire dati sensibili nei messaggi. Un eventuale invio email richiede una configurazione successiva con un servizio di posta.

## 5. Personalizzare l'azienda

- `public/index.html`: homepage, mission, impegni e ultimi articoli.
- `public/azienda.html`: identità aziendale, mission e partnership strategica.
- `public/soluzioni.html`: aree di intervento e accompagnamento al cambiamento.
- `public/articoli.html`: archivio con ricerca, filtri e paginazione.
- `public/contatti.html`: modulo per registrare una richiesta.
- `public/privacy.html`: informativa consultabile anche senza JavaScript; il modulo contatti resta disabilitato finché il relativo script non è caricato, evitando invii accidentali dei dati nella URL.
- Le pagine includono navigazione comune, contatore e informativa privacy.
- `public/styles.css`: colori, tipografia, impaginazione e versione mobile.
- `public/brand.css`: dimensioni del logo originale e accenti indaco/giallo, su desktop e telefono.
- `public/assets/sirius-logo.png`: file originale dell’azienda, usato senza ritocchi nella linguetta bianca laterale, nel piè di pagina, nella grafica delle orbite e come icona del sito. La linguetta riprende il riferimento fornito: logo verticale, angoli arrotondati a destra e ombra morbida. È fissata al bordo sinistro di tutte le pagine e resta visibile durante lo scorrimento.
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

## Privacy e preferenze

L’informativa spiega come vengono usati i dati: non è un contratto da “accettare”. Il consenso è richiesto nel sito soltanto per le statistiche facoltative. Non sono presenti newsletter, marketing o profilazione pubblicitaria. Il limite antispam del modulo usa l’indirizzo della connessione soltanto nella memoria del processo; l’informativa ne descrive separatamente la finalità di sicurezza e la necessità di valutare la base pertinente.

- **Accetta statistiche** attiva il contatore facoltativo.
- **Rifiuta statistiche**, oppure la X per continuare senza statistiche, lascia il contatore disattivato per quel browser.
- **Preferenze cookie**, nel piè di pagina di ogni pagina, permette di modificare o revocare la scelta. Il rifiuto successivo elimina il cookie di sessione del contatore e blocca nuove registrazioni.
- La preferenza è ricordata per sei mesi di calendario tramite un cookie funzionale firmato. È una durata scelta per questa implementazione, non una scadenza universale imposta al consenso dalla legge.
- Il server conserva una prova tecnica minima della scelta in `data/privacy-events.ndjson`: identificativo della ricevuta, scelta, versione dell’informativa e date, senza nomi, email o indirizzi IP. Gli eventi scaduti vengono rimossi durante le operazioni sulle preferenze.
- Un rifiuto viene salvato anche nella memoria locale del browser (`sirius-statistics-rejected`), per evitare riattivazioni in caso di errori di rete, ricaricamenti o altre schede. Questa preferenza non può mai attivare le statistiche: viene rimossa solo dopo una nuova accettazione verificata.
- La scelta del tema richiesta dal visitatore e la memorizzazione delle preferenze cookie sono funzioni del sito, spiegate nell’informativa.

Prima di raccogliere dati su un sito pubblico, completare e verificare l’informativa con **identità e recapiti del titolare, sede, conservazione effettiva dei contatti, destinatari/fornitori, eventuali trasferimenti e modalità di esercizio dei diritti**. I dati societari non sono stati inventati: sono ancora da fornire. Per richieste diverse da quelle sui servizi e precontrattuali, va valutata la base giuridica pertinente. La correttezza di questi meccanismi tecnici non costituisce una verifica completa di conformità dell’attività aziendale.

Riferimenti ufficiali: [GDPR, artt. 6, 7 e 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=it) e [Garante, Linee guida cookie del 10 giugno 2021](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876). Le condizioni per assimilare determinati analytics ai tecnici vanno valutate nel caso concreto; questo sito sceglie invece l’attivazione facoltativa tramite consenso.

## Note sui file

La cartella `data` viene creata automaticamente al primo avvio ed è esclusa da Git, insieme ai dati raccolti. I test e gli strumenti usati durante lo sviluppo non richiedono dipendenze per usare il sito. Per copiare il progetto su un altro PC usa tutti i file dell'archivio; per conservare visite e messaggi già raccolti, copia separatamente anche la tua cartella `data`.
