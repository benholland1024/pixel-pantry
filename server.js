// server.js
import express from 'express'
const app = express()

app.use(express.static('website'))
app.use(express.json())

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})

app.post('/save-pixel', (req, res) => {
  const { x, y, color } = req.body
  console.log(`Pixel saved at (${x}, ${y}) with color ${color}`)
  res.status(200).send('Pixel saved')
})