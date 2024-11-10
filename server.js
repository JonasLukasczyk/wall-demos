import express from 'express';
import http from 'http';
const app = express();
const server = http.createServer(app);
import { Server } from 'socket.io';
const io = new Server(server,{
    allowEIO3: true,
    cors: {credentials: true, origin: 'http://localhost:4444'},
});
import path from 'path';
import { fileURLToPath } from 'url';

// Serve static files from the 'public' directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, './dist')));

let mode = 0;
io.on('connection', (socket) => {
  mode = mode ? 0 : 1;
  console.log('client connected', mode);
  socket.on('update_camera', cam=>{
    io.emit('update_camera',cam);
  });
  socket.emit('update_display', mode);
});

const port = 4444;
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
