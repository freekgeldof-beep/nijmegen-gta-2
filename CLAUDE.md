# City Run

Read AGENTS.md and GENERATE-CITY.md. npm ci; npm test; npm run build.
To generate a city, fill public/city.json and run npm run import:city and npm run validate:city.
Simulation is in src/world.js, entities.js, vehiclePhysics.js, missions.js, race.js and server/arena.js. Rendering is src/renderWorld.js/renderEntities.js. Branding comes from city.json. Main.js routes browser input; focus loss and pause clear held keys.
