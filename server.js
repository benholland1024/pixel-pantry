// server.js
import crypto from 'crypto'
import express from 'express'
import dotenv from 'dotenv'

const app = express()

dotenv.config({ path: './.env' })

const PORT = process.env.PORT || 3002  // Read from env or default to 3002

app.use(express.static('website'))
app.use(express.json())

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

import DataPantry, { eq, gt } from 'datapantry';

const myDatabase = DataPantry.database(process.env.API_KEY);

//  Runs when starting the server
async function test_schema() {
  const schema = await myDatabase.schema()  //  { DBname: String, tables: [] }
  if (!schema) {
    console.log("⚠️ Schema not found:", schema);
  } else if (schema.tables.length === 0) {
    console.log("⚠️ No tables found in schema:", schema);
  } else if (schema.tables[0].name !== 'pixels') {
    console.log("⚠️ First table is not named 'pixels':", schema.tables[0]);
  } else if (schema.tables[0].columns.length === 0) {
    console.log("⚠️ No columns found in the first table:", schema.tables[0]);
  } 
  const columnNames = schema.tables[0].columns.map(col => col.name);
  if (!columnNames.includes('x') || !columnNames.includes('y') || !columnNames.includes('color')) {
    console.log("⚠️ Required columns ('x', 'y', 'color') are missing in the first table:", schema.tables[0]);
  } else {
    console.log("✅ Schema loaded successfully");
  }
  // console.log("Schema details:", JSON.stringify(schema, null, 2));
}
test_schema();

// Hashes the user's IP address for privacy. (Stored for rate limiting)
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

//  Loads all pixels, and also the user's rate-limiting info
app.get('/api/load-pixels', async (req, res) => {
  console.log("Received request to /load-pixels");
  try {
    //  Get all pixels
    const pixels = await myDatabase.select('*').from('pixels').limit(1000).execute()

    //  Get the user's most recent pixel to enforce rate limiting
    const hashedIP = hashIP(req.headers['x-forwarded-for'] || req.socket.remoteAddress)
    const mostRecentPixel = await myDatabase.select('*').from('pixels')
      .where(eq('ip', hashedIP))
      .orderBy('created_at', 'DESC')
      .limit(1)
      .first()  // Gets just the first result
    //  If the user placed a pixel in the last 5 minutes, calculate wait time
    let waitTime = 0
    if (mostRecentPixel) {
      const pixelTime = new Date(mostRecentPixel.created_at)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      if (pixelTime > fiveMinutesAgo) {
        waitTime = Math.ceil((pixelTime.getTime() + 5 * 60 * 1000 - Date.now()) / 1000)
      }
    }

    res.json({pixels, waitTime})
  } catch (error) {
    console.error('Error loading pixel data:', error);
    res.status(500).send('Error loading pixel data');
  }
})

//  Saves pixel data to DataPantry! Up to 10 pixels may be submitted.
app.post('/api/save-pixel', async (req, res) => {
  const { pixels } = req.body
  const hashedIP = hashIP(req.headers['x-forwarded-for'] || req.socket.remoteAddress)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  //  Make sure the user's IP isn't in timeout
  const mostRecentPixel = await myDatabase.select('*').from('pixels')
    .where(eq('ip', hashedIP))
    .where(gt('created_at', fiveMinutesAgo.toISOString()))
    .first()
  if (mostRecentPixel) {
    console.log(`IP ${hashedIP} is in timeout. Rejecting pixel save.`);
    res.status(429).send('You are in timeout. Please wait before placing more pixels.');
    return;
  }

  //  Make sure the user is submitting 10 or fewer pixels
  if (!pixels || !Array.isArray(pixels) || pixels.length === 0 || pixels.length > 10) {
    console.log(`Invalid pixel submission from IP ${hashedIP}:`, pixels);
    res.status(400).send('Invalid pixel submission. You can submit between 1 and 10 pixels at a time.');
    return;
  }

  //  Format the pixel data for insertion
  pixels.forEach((pixel) => {
    pixel.ip = hashedIP
    pixel.created_at = new Date().toISOString()
    pixel.id = `x${pixel.x}_y${pixel.y}`  //  Create a unique ID for each pixel based on its coordinates
  })
  //  Make the api call to the DataPantry server
  const insertResult = await myDatabase.insert('pixels').orReplace().values(pixels);
  if (insertResult.changes != pixels.length) {
    console.error(`Error: Expected to insert ${pixels.length} records, but only ${insertResult.changes} were inserted.`);
    res.status(500).send('Error saving pixel data');
    return;
  }
  res.send('Pixels saved successfully')
})