# Nijmegen GTA 2 · City Run

Een herbruikbare GTA2-achtige PixiJS-engine voor Nederlandse steden met echte OpenStreetMap-data. Deze repo is ingevuld voor Nijmegen. De oorspronkelijke basis blijft beschikbaar op https://github.com/freekgeldof-beep/gta-2-base. Gebruik [GENERATE-CITY.md](GENERATE-CITY.md) om met één prompt een aparte [stad]-gta-2-repo te laten maken. Nijmegen is de eerste ingevulde variant: https://github.com/freekgeldof-beep/nijmegen-gta-2.

## Lokaal

```sh
npm ci
npm run dev
```

Vul public/city.json in en voer npm run import:city uit. De importer haalt alleen bij generatie OSM-data op; het spel gebruikt daarna lokale JSON-bestanden en vraagt tijdens het spelen geen Overpass-data op.

```sh
npm run validate:city
npm test
npm run build
npm start
```

## Stadsconfiguratie

public/city.json bevat id, naam, netnummer, seed, bbox [south,west,north,east], gesloten boundary [[lat,lon],...], spawn, policeStation, club, requiredLandmarks en terminalBridges. Gebruik boundaryScale:1 voor een exact eindpunt. Dezelfde configuratie en data worden door client en online server geladen. Water heeft aparte polygonen en breedtes; wegen worden op OSM-knooppunten gesplitst en op de grens geknipt. De grensbeschrijving en een lijst met OSM-landmarks staan in het kaartoverzicht [G].

## Bediening

Pijltjes rijden/lopen, spatie in/uitstappen, W schieten, Q mijn, M koeriersrit, L race, A claxon, S sirene, N dag/avond, O/P zoom, G stadskaart, Esc pauze. Muziek en effecten stel je in het pauzemenu in.

## Online / Render

Build: npm ci --include=dev && npm run build. Start: npm start. Configureer PORT en een permanente GAME_DATA_DIR voor accounts; NODE_ENV=production achter HTTPS. Iedere stadrepo heeft een eigen service en accountopslag. Geen deploy-config van Eindhoven wordt veranderd. render.yaml is een optionele gratis serviceblueprint; verbind de specifieke stadrepo en branch master. Publieke Overpass-servers zijn alleen bedoeld voor incidentele imports, niet als live spelbackend.

## Bronnen

Kaartdata © OpenStreetMap contributors, https://www.openstreetmap.org/copyright (ODbL). data/provenance.json bevat importdatum en objectaantallen. OSM is niet volledig: “alle landmarks” betekent alle door de importer gevonden benoemde landmarks binnen de gekozen grens plus de gecontroleerde verplichte lijst. Bestaande Eindhoven-data blijft uitsluitend als regressiefixture onder test/fixtures/eindhoven. De engine is gebaseerd op freekgeldof-beep/eindhoven-gta-2, mergecommit 4f31905; originele audio wordt behouden.

## Nijmegen-grens

Spoor west → Graafseweg → Maas-Waalkanaal → Hatertseweg → S100 (Grootstalselaan / Scheidingsweg / Sionsweg) → Heilig Landstichting → Sophiaweg → Holleweg → Nieuwe Rijksweg / Ubbergseweg → Waal. Waalbrug stopt aan de noordelijke landing.

- Grens volgt de genoemde OSM-wegen en het kanaal met 18 m randruimte, zodat je op grenswegen kunt rijden.
- Aan de Waal is de zuidelijke kadegrens met controlepunten gevolgd; alleen een smalle corridor voor de Waalbrug steekt over het water.
- Noordelijke Waalbruggrens: latitude 51.85448; de Verlengde Waalbrug naar Lent zit niet in het gebied.
- De opgegeven volgorde houdt het Goffertstadion en Radboud in het speelgebied; Museumpark Orientalis ligt buiten de S100-grens.

Browserautomatisering van localhost kan op deze machine door de browser worden geblokkeerd. De gevalideerde wereldkaart staat voor Nijmegen ook als public/map-preview.png klaar; een kaartpreview bewijst geen visuele gameplaytest.
