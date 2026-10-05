# Prompt voor elke Nederlandse stad

Kopieer deze prompt in Codex of Claude en vervang de blokhaken:

> Maak op basis van https://github.com/freekgeldof-beep/gta-2-base een nieuw zelfstandig GTA2-spel voor **[STAD]** in Nederland. Noem de GitHub-repo **[stad-slug]-gta-2** en zet hem lokaal naast de basisrepo. Laat bestaande stadrepo's intact.
>
> Het speelgebied is **[GRENS: wegen, spoorlijnen, rivieren/kanaal, wijken of gemeentelijke grens]**. De startplek is **[PLEK / STRAAT]**. Bruggen zijn berijdbaar tot **[EINDPUNTEN]** en daar stopt het speelgebied. Netnummer: **[NETNUMMER]**. Club en kleuren: **[OPTIONEEL]**.
>
> Zoek de echte grens in OpenStreetMap en leg deze vast als gesloten, niet-kruisende polygon in public/city.json. Gebruik de bestaande importer en stadsconfiguratie; voeg geen stadsnamen toe aan de generieke engine. Importeer de echte wegen, gebouwen, parken, spoorlijnen, water en alle benoemde historische, toeristische en publieke landmarks binnen het gebied. Maak ook **[VERPLICHTE LANDMARKS]** herkenbaar en vindbaar op de stadskaart. Gebruik brondata, geen verzonnen gebouwcontouren. Ontbrekende landmarks mag je alleen aanvullen op basis van een gecontroleerde bron; vermeld dat in de bronnotities.
>
> Behoud rijden/lopen, politie, missies, races, muziek en de online-jacht. Zorg voor bereikbare spawn- en bezorgpunten, een verbonden wegennet, correcte water/brug-botsingen en een harde speelgrens. Genereer een kaartoverzicht met alle landmarknamen, zoekfunctie, grens en OpenStreetMap-attributie.
>
> Draai beide regressietestsets, de stadsvalidatie en productiebuild; controleer het spel en de kaart visueel in een browser. Commit en push de nieuwe repo. Geef de repo-link, lokale map, verificatieresultaten en eventuele echte bronbeperkingen. Zet hosting pas klaar als ik daar opdracht voor geef.

## Werkwijze

1. Kopieer de basis naar een nieuwe repo, vul public/city.json in.
2. npm ci; npm run import:city (of node scripts/import-city.mjs --input bestand.json voor gecachte Overpass-data).
3. npm run validate:city; npm test; npm run build.
4. npm run dev voor solo; npm start na build voor solo en de online arena.

De prompt is een opdracht aan een code-agent: hij vertaalt de beschreven grens naar gecontroleerde coördinaten. Het spel heeft geen ingebouwde AI of betaalde geocoding-API nodig.

Configureer `pickups.beerStreets` met echte uitgaansstraten van de stad voor vaste bierkratten.
