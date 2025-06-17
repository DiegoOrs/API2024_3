import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import usuarioRoutes from './routes/usuarioRoutes.js';
import canchaRoutes from './routes/canchaRoutes.js';
import disponibilidadRoutes from './routes/disponibilidadRoutes.js';
import reservaRoutes from './routes/reservaRoutes.js';
import comentarioRoutes from './routes/comentarioRoutes.js';
import sancionRoutes from './routes/sancionRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Cargar variables de entorno
dotenv.config();
// Definir el módulo de ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json()); // Para que interprete los objetos JSON
app.use(express.urlencoded({ extended: true })); // Se añade para poder receptar formularios

// Ya no necesitas esta línea porque no estás usando la carpeta 'uploads':
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rutas
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/canchas', canchaRoutes);
app.use('/api/disponibilidad', disponibilidadRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/comentarios', comentarioRoutes);
app.use('/api/sanciones', sancionRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API de Reservas Salinas funcionando correctamente' });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

export default app;
