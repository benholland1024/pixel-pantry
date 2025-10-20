// server.js
import express from 'express'
const app = express()

app.use(express.static('website'))
app.use(express.json())

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})

app.post('/save-pixel', (req, res) => {
  const { pixels } = req.body
  pixels.forEach((pixel) => {
    console.log(`Saved pixel: `, pixel)
  })
  res.status(200).send('Pixels saved')
})