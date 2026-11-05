# Brief per Claude Design: CRM Somaspace

Copia da qui in giù in Claude Design. Se il progetto è lungo, lavora una sezione alla volta: prima il sistema visivo (sezione 3), poi le schermate in ordine di priorità (sezione 5).

---

## 1. Il prodotto

Somaspace è un'agenzia che lavora con aziende del settore spazio: brand, siti web, social, video e render 3D, deck, eventi, lead generation. Il CRM interno lo usano i tre fondatori, Michele, Alessia e Giordano. Più avanti lo useranno anche dei collaboratori con accessi limitati.

Il CRM non è un archivio di contatti. Ogni mattina dice a chi scrivere e cosa scrivere, tiene traccia di progetti e task, analizza meeting e chiamate, e propone opportunità: servizi nuovi da offrire, bandi da sfruttare, clienti dormienti da riattivare. Un agente AI lavora in background e propone. Le persone decidono.

**Riferimento visivo: Attio.** Liste pulite, schede con timeline, pipeline a colonne, barra di comando con Cmd+K. Strumento professionale da usare tutto il giorno: denso di informazioni ma calmo, niente decorazioni.

## 2. Principi

- **Neutro e preciso.** Base di grigi leggermente freddi, un solo colore d'accento. Il colore serve a comunicare uno stato (caldo, freddo, in ritardo, vinto), non a decorare.
- **Denso ma leggibile.** Testo base 14px, tabelle a 13px, righe da 36-40px. Molte informazioni a schermo senza sembrare affollato.
- **L'AI si vede, ma non urla.** Tutto quello che propone l'agente ha un marcatore discreto e coerente (piccola icona e etichetta "Proposto"). Ogni proposta ha sempre tre azioni: Accetta, Modifica, Scarta.
- **La privacy si vede.** Quello che è visibile solo a te (le tue email, le tue bozze) ha un indicatore discreto: lucchetto più "Solo tu".
- **Desktop prima di tutto**, ma la schermata Oggi e la nota vocale devono funzionare bene da telefono.
- **Tema chiaro e tema scuro**, curati tutti e due allo stesso modo.
- **In italiano.** Testi brevi e diretti. I pulsanti dicono esattamente cosa succede.

## 3. Sistema visivo da produrre

L'app verrà costruita con **shadcn/ui, Tailwind e icone Lucide**. Per rendere il passaggio facile:

- Esporta i colori come variabili CSS con i nomi di shadcn: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`. Una versione per il tema chiaro e una per lo scuro.
- Usa icone Lucide.
- Indica font (Google Fonts), scala tipografica, spaziature, raggi degli angoli e ombre.

**Colori di stato da definire** (devono funzionare in chiaro e in scuro):

| Gruppo | Valori |
|---|---|
| Modalità follow-up | Caldo, Freddo, Nessuno |
| Stage opportunità | Lead, In progress, Vinta, Persa |
| Forza relazione | Molto forte, Forte, Media, Debole, Nessuna. Meglio come piccola barra a 5 tacche che come colore |
| Salute progetto | Verde, Giallo, Rosso |
| Stato task | Proposto, Da fare, In corso, Fatto |
| Stato dati | Da verificare, Verificato |
| Relazione azienda | Prospect, Cliente, Partner, Fornitore, Interno |
| Ritardo | In tempo, In scadenza oggi, In ritardo |

**Componenti** (ognuno con i suoi stati: normale, hover, selezionato, disabilitato, caricamento, vuoto):

1. Sidebar di navigazione: logo, voci con conteggi (Oggi 12, Da approvare 5), sezione viste salvate, utente in basso.
2. Barra superiore: titolo della pagina, breadcrumb, ricerca, pulsante "Nuovo".
3. Palette di comando (Cmd+K): cerca aziende, persone, deal, progetti, task, più azioni rapide.
4. Tabella dati: intestazioni ordinabili, filtri come chip sopra la tabella, selettore di viste salvate, selezione multipla, colonne con tipi diversi (testo, chip, data relativa, avatar, barra di forza).
5. Intestazione di una scheda: nome, logo o avatar, chip principali, azioni.
6. Pannello attributi: coppie etichetta-valore modificabili al clic, con il marcatore "Proposto dall'agente" quando il valore viene dall'AI.
7. Timeline: elementi per email inviata, email ricevuta, meeting, chiamata, nota vocale, nota, cambio di valore, task creato o completato. Ogni elemento ha icona, data, sintesi di 1-2 righe, link.
8. Card della pipeline e colonna con totale in euro.
9. Riga task: checkbox, titolo, progetto, assegnatari, scadenza, priorità, sotto-task espandibili.
10. Card proposta: cosa propone l'agente, perché (una riga), Accetta, Modifica, Scarta.
11. Voce della coda Oggi: persona, azienda, motivo, giorni di ritardo, azioni (Apri bozza, Segna come fatto, Rimanda, Cambia modalità).
12. Card briefing pre-meeting.
13. Pulsante nota vocale con i suoi stati: pronto, in registrazione con timer, caricamento, trascrizione in corso, fatto.
14. Pannello laterale (sheet) e finestra modale.
15. Selettore "Rimanda": 1 settimana, 1 mese, scegli una data.
16. Avatar e gruppo di avatar, chip, badge, tooltip, toast, stati vuoti, scheletri di caricamento.

## 4. Dati di esempio

Usa nomi **inventati**, mai clienti reali. Esempi del settore: Orbitale Srl (Italia, Upstream), Nebula Dynamics (Germania, Hardware), Stellar Forge (Francia, Software), AstroLink (Spagna, Downstream), Kepler Ground Systems (Paesi Bassi, B2B). Valori dei deal tra 4.000 e 60.000 €. Persone con nome, cognome e ruolo (CEO, Head of Marketing, Business Developer).

## 5. Schermate, in ordine di priorità

Per ogni schermata: versione desktop a 1440px. Per Oggi e nota vocale anche mobile a 390px. Tema chiaro, più almeno Oggi e una scheda anche in scuro.

### Priorità 1: il cuore

**1. Oggi (home).** La coda del giorno divisa in sezioni: Ti hanno scritto, Meeting di oggi (con briefing), Task in scadenza, Preventivi da seguire (con passo 1-4 e giorni dall'invio), Caldi da sentire, Freddi da sentire, Opportunità suggerite. In alto un riepilogo con i conteggi. Ogni voce ha le azioni rapide. Su mobile è una lista verticale con azioni a scorrimento o in un menu.

**2. Companies (lista).** Tabella: Nome, Categoria, Nazione, Relazione, Forza relazione, Ultimo contatto, Owner, Progetti attivi. Filtri, viste salvate, "Nuova azienda" che chiede solo il nome.

**3. Scheda azienda.** A sinistra il pannello attributi. Al centro le schede (tab): Panoramica, Persone, Opportunità, Progetti, Timeline, Fatti. Nella panoramica: stato in breve scritto dall'agente, fatti recenti sul cliente, prossime azioni. Mostra un'azienda appena arricchita dall'agente, con i campi "Da verificare".

**4. Scheda persona.** Attributi, box follow-up (modalità, prossima data, link alla bozza, Rimanda, Cambia modalità), note del primo meeting, evento di provenienza, timeline. Alcune voci della timeline marcate "Solo tu".

**5. Pipeline.** Colonne Lead, In progress, Vinta, Persa con il totale in euro. Card: nome del deal, azienda, valore, passo di follow-up, giorni dall'invio. Mostra la modale che compare trascinando in Vinta (chiede il valore finale) e in Persa (chiede il motivo).

### Priorità 2: progetti e intelligenza

**6. Progetti (lista).** Progetti attivi con cliente, salute, avanzamento dei task, prossima scadenza, team.

**7. Scheda progetto.** Intestazione con salute e stato in breve. Tab: Task (lista con sotto-task, raggruppabile per stato o assegnatario, anche vista kanban), Meeting, Timeline, Fatti. Task proposti dall'agente in evidenza.

**8. I miei task.** Tutti i task assegnati a me, divisi per Oggi, Questa settimana, Più avanti, In ritardo.

**9. Dettaglio meeting.** Partecipanti, fonte (Meet, nota vocale, audio), sintesi, decisioni, prossimi passi, task proposti con assegnatario e scadenza da accettare, fatti estratti. Trascrizione completa in un pannello comprimibile con "Solo tu".

**10. Nota vocale (mobile).** Dopo una chiamata: scegli la persona o "contatto nuovo", registri, attendi, rivedi cosa ha capito l'agente (sintesi, task, opportunità) e confermi.

**11. Da approvare.** Tre gruppi: nuovi contatti proposti, cambi caldo o freddo suggeriti, task proposti, dati aziendali da verificare. Azioni in blocco.

### Priorità 3: il resto

**12. Opportunità suggerite.** Si sceglie un servizio o un bando e si vede la lista di clienti consigliati, ordinati, con il motivo in una riga e "Prepara bozza".

**13. Bandi.** Elenco con ente, scadenza (con conto alla rovescia), importo, settori, quanti clienti corrispondono.

**14. Scheda opportunità.** Campi, sequenza di follow-up visualizzata (+3, +7, +14, +30 giorni), timeline con cambi di valore.

**15. Eventi.** Elenco con persone incontrate, arrivate a un'opportunità, diventate clienti, conversione.

**16. Impostazioni.** Parametri (cadenze, sequenza, orario del digest, domini esclusi), caselle collegate, log dell'agente, pagina "Cosa ha condiviso la mia casella" con il pulsante per ritirare un fatto.

**17. Login.** Una sola schermata: logo e "Accedi con Google".

## 6. Cosa non serve

Niente pagine marketing, niente onboarding elaborato, niente illustrazioni decorative, niente gradienti.

## 7. Cosa consegnare

1. Sistema visivo: variabili CSS chiaro e scuro con i nomi di shadcn, tipografia, spaziature, raggi, icone.
2. Libreria dei componenti della sezione 3.
3. Le schermate della sezione 5, a partire dalla priorità 1.
