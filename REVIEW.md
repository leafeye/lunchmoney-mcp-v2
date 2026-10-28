# Review lunchmoney-mcp-v2 (v0.1.1)

Datum: 2026-10-28. Bron: de code in `src/`, de gegenereerde types in `src/types.ts` en de OpenAPI-spec in `@lunch-money/v2-api-spec` (2.8.x).

## Wat ik heb gedraaid

- `npm ci`: OK. `npm audit` meldt high-severity advisories in `@modelcontextprotocol/sdk` 1.26.0 en transitieve deps (zie punt 19).
- `npx tsc --noEmit`: schoon. Met `--noUnusedLocals` komen er twee ongebruikte imports bij (punt 16).
- Smoke test (`/tmp/lm-smoke/smoke.mjs`): `node dist/index.js` met `LUNCHMONEY_TOKEN=fake`, via stdio `initialize`, `tools/list` en `tools/call list_tags`. Resultaat: 14 tools, `serverInfo.version` = `0.1.0`, de echte API geeft 401, die als tool-error terugkomt.
- Cache-reproductie (`/tmp/lm-smoke/nocache.mjs`): `formatTransaction()` aanroepen zonder geïnitialiseerde cache gooit `Cache not initialized`.

## Niet geverifieerd

Er is geen echt token, dus het volgende is alleen tegen de spec en types gecontroleerd, niet tegen de live API:
- Alle succesvolle responses en de opmaak ervan.
- Het teken van `totals.inflow` in `/summary` (punt 4). Het spec-voorbeeld is negatief; de live API heb ik niet gezien.
- Of `PUT /transactions/{id}` met `manual_account_id` echt verplaatst, en of `PUT /manual_accounts/{id}` `type` accepteert (de spec zegt van wel).
- Het 422-bodyformaat bij category- en tag-delete.
- Of de API hoofdletter-valuta (`EUR`) weigert (punt 9).

## Bevindingen

Ernst: **Hoog** = verkeerde data of verkeerde actie, **Middel** = tool faalt of misleidt in een normale situatie, **Laag** = netheid, docs, randgeval.

### 1. Hoog: zonder cache faalt elke tool die namen toont
`src/cache.ts:32-81`, `src/index.ts:33-38`

Als `initCache()` faalt (offline bij opstarten, 5xx, rate limit), logt `index.ts` "Continuing without cache — some features may show IDs instead of names". `categoryName`, `tagNames` en `accountName` roepen echter `getCache()` aan, en die gooit. Het proces crasht niet: de SDK vangt de exception en geeft een tool-error terug. Maar `list_transactions`, `manage_transaction`, `bulk_update_transactions`, `split_transaction`, `group_transactions`, `get_summary`, `get_recurring` en `list_categories` (flat) geven dan allemaal "Cache not initialized". De cache herstelt pas na een herstart. Gereproduceerd met `nocache.mjs`.

**Fix:** lookups vallen terug op `Category #id` als de cache leeg is. Laad de cache opnieuw (gededupliceerd) bij de volgende tool-call die namen nodig heeft.

### 2. Hoog: mislukte cache-refresh meldt een geslaagde mutatie als fout
`src/tools/categories.ts:80,109,138`, `tags.ts:59,84,113`, `accounts.ts:94,123,142`

Na een geslaagde create/update/delete volgt `await refreshCache(...)`. Gooit die (geen cache, 429, netwerk), dan krijgt het model een error terwijl de mutatie wel is uitgevoerd. Een model probeert het dan opnieuw: dubbele categorie, tag of account.

**Fix:** refresh best-effort maken (fout loggen, niet gooien).

### 3. Hoog: `manage_transaction` update negeert `manual_account_id`
`src/tools/transactions.ts:104,154-162`

Het schema accepteert `manual_account_id`, create stuurt het mee, update niet. "Verplaats deze transactie naar account X" meldt succes zonder iets te veranderen. De API ondersteunt het veld (`updateTransactionObject.manual_account_id`, `null` = loskoppelen).

**Fix:** meesturen bij update.

### 4. Hoog: `get_summary` rekent Income en Net verkeerd (volgens de spec)
`src/format.ts:160-170`

In het spec-voorbeeld is `totals.inflow.other_activity` `-125.50` (credits zijn negatief). De code toont dan `Income: -$215.49` en `Net = inflow - outflow = -796.93`, terwijl het `-365.95` moet zijn.

**Fix:** `income = |inflow|`, `net = income - spending`. Dat is correct bij beide tekenconventies.

### 5. Middel: `get_summary` toont altijd `$`
`src/format.ts:300-303`

`formatCurrency` hardcodeert `$`. Een gebruiker met EUR als primaire valuta ziet `$` bij elk bedrag.

**Fix:** `primary_currency` via `/me` ophalen en `currencySymbol` gebruiken.

### 6. Middel: alleen `start_date` of alleen `end_date` geeft een API-fout
`src/tools/transactions.ts:44-53`, `src/tools/recurring.ts:18-25`

De API eist beide datums zodra er één is ("Required if end_date exists"). De default springt alleen in als beide ontbreken. "Transacties sinds 1 oktober" (`start_date` alleen) geeft dus 400.

**Fix:** de ontbrekende kant aanvullen: `end_date` = vandaag, `start_date` = `end_date` − 30 dagen. Bij recurring: de maand van de opgegeven datum.

### 7. Middel: default-datums in UTC
`src/tools/transactions.ts:49,52`

`toISOString()` is UTC. In Amsterdam tussen 00:00 en 02:00 is `end_date` gisteren, en vallen transacties van vandaag weg. Geverifieerd met `TZ=Europe/Amsterdam`.

**Fix:** lokale datum formatteren.

### 8. Middel: `manage_account` update negeert `type`
`src/tools/accounts.ts:61,109-116`

Hetzelfde patroon als punt 3: het schema accepteert `type`, maar update stuurt het niet mee. De API ondersteunt het (`updateManualAccountRequestObject.type`).

**Fix:** meesturen.

### 9. Laag: valuta wordt niet genormaliseerd
`src/tools/transactions.ts:103,126,160,219`, `accounts.ts:65`

De API verwacht lowercase (`currencyEnum`). `as never` verbergt dat. Een model stuurt vaak `"EUR"`.

**Fix:** `.toLowerCase()` (via zod `transform`).

### 10. Middel: delete met 422 zonder `dependents` meldt "deleted successfully"
`src/tools/categories.ts:130-136`, `tags.ts:105-111`, `format.ts:276-289`

Als een 422 geen `dependents` bevat, krijgt `formatDeleteResult(type, id, undefined)` geen deps en geeft "Category X deleted successfully." terug, met `isError: true`.

**Fix:** alleen de dependency-melding tonen als `dependents` aanwezig is, anders `handleError`.

### 11. Laag: lege `errors[]` geeft een lege foutmelding
`src/client.ts:35-36`

`[].join("; ")` is `""` en `"" ?? message` blijft `""`. Gevolg: een ApiError zonder tekst.

**Fix:** `||` in plaats van `??`, lege arrays negeren.

### 12. Laag: create kan crashen op een overgeslagen duplicaat
`src/tools/transactions.ts:136`

`POST /transactions` kan een transactie in `skipped_duplicates` zetten en `transactions: []` teruggeven. Dan geeft `formatTransaction(undefined)` een TypeError. Met de huidige velden (geen `external_id`, geen `skip_duplicates`) is dit theoretisch.

**Fix:** guard met een duidelijke melding.

### 13. Middel: opstarten wacht op 4 API-calls vóór `server.connect`
`src/index.ts:33-42`

Er is geen timeout. Bij een trage of hangende API reageert de server niet op `initialize`, en de client kan de server dan als dood markeren. Gemeten met fake token: 650 ms tot `initialize`.

**Fix:** eerst verbinden, de cache op de achtergrond laden (samen met punt 1).

### 14. Laag: tool-beschrijvingen noemen een niet-bestaand `account_id`
`src/tools/transactions.ts:17,92`

De parameters heten `manual_account_id` / `plaid_account_id`. **Fix:** beschrijving aanpassen.

### 15. Laag: serverversie hardcoded `0.1.0`
`src/index.ts:20`

`package.json` zegt 0.1.1. **Fix:** de versie uit `package.json` lezen.

### 16. Laag: ongebruikte imports
`src/tools/transactions.ts:4` (`refreshCache`), `src/format.ts:2` (`getCache`). **Fix:** verwijderen.

### 17. Laag: onnodige casts verbergen typefouten
Overal in `src/tools/*`, `src/format.ts`

- Responses van `/tags`, `/manual_accounts`, `/plaid_accounts`, `/recurring_items`, `/me`, `/summary`, create/update category/tag/account zijn al correct getypeerd. Casts als `data as { tags?: Tag[] }`, `data as Record<string, unknown>` en `data as Category` zijn overbodig. `formatSummary` en `formatUser` werken daardoor op `Record<string, unknown>` met handmatige casts.
- Request bodies worden opgebouwd als `Record<string, unknown>` en dan `as never` gecast. Een typo in een veldnaam (zie punt 3 en 8: velden vergeten) ziet de compiler daardoor niet. Voor `updateTransactionObject`, `updateTagRequestObject` en `updateManualAccountRequestObject` (alle velden optioneel) is geen cast nodig. De create-types markeren velden met een default als verplicht (`openapi-typescript` `defaultNonNullable`). Daar is een cast nodig, maar dan van een `Partial<...>`-getypeerde body in plaats van `Record<string, unknown>`.

**Fix:** response-casts weghalen, bodies typeren met de gegenereerde request-types.

### 18. Laag: packaging
`package.json`, `.npmignore`

- Geen `prepublishOnly`. `dist/` staat in `.gitignore`, dus `npm publish` publiceert wat er toevallig in `dist/` staat, ook verouderde bestanden van een oude build (`tsc` ruimt niets op).
- Blacklist via `.npmignore` in plaats van `"files": ["dist"]`. Het pakket bevat nu `.d.ts` (215 kB `types.d.ts`) en `.js.map` die naar niet-meegeleverde `src/` verwijzen. Voor een CLI-server zijn die niet nodig. (`npm pack --dry-run`: 38 bestanden, 45.6 kB.)
- Geen `repository`/`homepage`/`bugs` in `package.json`, dus geen link op npmjs.com.

**Fix:** `"files": ["dist", "README.md"]`, `prepublishOnly` die `dist` schoonmaakt en bouwt, `declaration`/`sourceMap` uit, `repository` toevoegen, `.npmignore` weg.

### 19. Laag: SDK-versie met advisories
`package.json:22`

`npm audit`: `@modelcontextprotocol/sdk` ≤1.31.0 heeft advisories, vooral over HTTP-transport en OAuth. Deze server gebruikt alleen stdio, dus de impact is klein. Nieuwe `npx`-installs krijgen via `^1.26.0` al de nieuwste versie. Alleen de lockfile (dev) zit vast.

**Fix:** `npm audit fix` of de ondergrens ophogen. Wel apart testen.

### 20. Laag: README Claude Code-instructie klopt niet
`README.md:32-48`

`~/.claude/mcp.json` is geen Claude Code-configbestand. Project-scope via `.mcp.json` klopt wel.

**Fix:** `claude mcp add lunchmoney -e LUNCHMONEY_TOKEN=... -- npx -y lunchmoney-mcp-v2` (met `--scope user` voor globaal). Daarnaast `-y` in de npx-args, zodat npx niet om bevestiging vraagt.

### 21. Laag: `server.tool()` is deprecated
Alle `src/tools/*`

SDK 1.26 markeert `server.tool` als `@deprecated Use registerTool instead`. Het werkt nog. Migreren is een grote mechanische diff zonder gedragswinst nu. **Fix:** later, apart.

### 22. Laag: ID-schema's accepteren floats en negatieve getallen
Alle `z.number()` voor ID's. **Fix:** `z.number().int()`. De API valideert dit ook, dus het levert alleen een betere foutmelding op. Niet opgepakt.

## Status na uitvoering

Op branch `review-improvements`. Elke fix is gecontroleerd met `tsc --noEmit --noUnusedLocals`, een build en de stdio smoke test. Fixes die request-bodies raken zijn ook gecontroleerd met een fetch-mock (`/tmp/lm-smoke/mockfetch.mjs` + `calls.mjs`): die logt de requests die de server echt verstuurt en geeft spec-achtige responses terug.

| # | Status | Commit |
|---|---|---|
| 1, 2, 13 | Gefixt | `fix: Fall back to IDs when the name cache is unavailable` |
| 3, 6, 7, 8, 9, 12, 14 | Gefixt | `fix: Send dropped update fields and complete one-sided date ranges` |
| 4, 5, 10, 11 | Gefixt | `fix: Correct summary income sign and currency, delete error handling` |
| 17 | Gefixt (3 casts blijven nodig voor create-bodies en category-update, met commentaar) | `refactor: Type request bodies and drop redundant casts` |
| 15 | Gefixt | `fix: Report the package.json version in serverInfo` |
| 16 | Gefixt (in de commits hierboven) | |
| 18 | Gefixt (behalve een LICENSE-bestand: `license` is MIT, maar er is geen LICENSE-file; de copyrighthouder kiest de eigenaar zelf) | `chore: Ship only dist and build cleanly before publish` |
| 20 | Gefixt | `docs: Use claude mcp add for Claude Code setup` |
| 19 | Niet gedaan: dependency-upgrade hoort apart en met een echt token getest te worden | |
| 21 | Niet gedaan: grote mechanische diff zonder gedragswinst | |
| 22 | Niet gedaan: de API valideert al | |

Gedragswijzigingen voor bestaande gebruikers (geen breaking schema-wijzigingen, wel ander gedrag):
- `list_transactions` met alleen `start_date` of alleen `end_date` werkt nu, in plaats van een API-fout te geven.
- `get_summary` toont Income positief, berekent Net anders en gebruikt de eigen valuta. Wie de oude output parseerde, ziet andere getallen.
- `get_summary` doet een extra `/me`-request per aanroep.
- `manage_account` create stuurt `institution_name: null` / `display_name: null` niet meer mee (de create-API accepteert geen null).
- Als de cache niet laadt, probeert elke tool-call met namen het opnieuw (4 extra GETs). Bij een kapot token of een rate limit zijn dat extra requests per call.

### Tweede review (subagent, gpt-6.1-sol)

Twee extra bevindingen in de cache-fix, beide gereproduceerd en gefixt in `fix: Refresh after in-flight cache load and bound cache requests`:
- **Middel:** een mutatie tijdens de warm-up liet verouderde namen achter. `refreshCache` haakte aan bij de lopende load, die de resource al vóór de mutatie had opgehaald. Nu wacht `refreshCache` die load af en haalt daarna opnieuw op.
- **Middel:** cache-requests hadden geen timeout. Een hangende `/plaid_accounts` hield tool-responses vast, ook van mutaties die al gelukt waren. Elke cache-request breekt nu na 5 s af en de tool valt terug op ID's. Zolang de cache niet laadt, kost elke tool-call met namen daardoor tot 5 s extra.
