import express from 'express';
import { 
  actualizarPerfil,
  cambiarFotoPerfil,
  obtenerPerfilUsuario, 
  registerUser, 
  loginUser, 
  getUserProfile, 
  deleteUser,
  getAllCiudadanos,
  getReservasCiudadano,
  aplicarSancionCiudadano
} from '../controladores/usuarioCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';
import { upload } from '../config/multer.js';

const router = express.Router();

// Rutas públicas
router.post('/register', upload, registerUser);
router.post('/login', loginUser);

// Rutas protegidas
router.get('/perfil', verifyToken, obtenerPerfilUsuario);
router.post('/perfil/foto', verifyToken, upload, cambiarFotoPerfil);
router.patch('/perfil', verifyToken, actualizarPerfil); // Ruta única para actualizar perfil
router.get('/:id', verifyToken, getUserProfile);
router.delete('/:id', verifyToken, deleteUser);

// Rutas protegidas solo para administradores
router.get('/admin/ciudadanos', verifyToken, getAllCiudadanos);
router.get('/admin/ciudadanos/:id_usuario/reservas', verifyToken, getReservasCiudadano);
router.post('/admin/ciudadanos/sancion', verifyToken, aplicarSancionCiudadano);

export default router;