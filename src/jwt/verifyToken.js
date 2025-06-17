import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export function verifyToken(req, res, next) {
  try {
    // Verifica múltiples posibles ubicaciones del token
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                 req.headers['authorization']?.replace('Bearer ', '') ||
                 req.query.token;
    
    if (!token) {
      console.error('Token no proporcionado en la solicitud');
      return res.status(401).json({ 
        success: false, 
        message: 'Token no proporcionado' 
      });
    }
    
    // Verifica el token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Estructura consistente para el usuario
    req.user = {
      id: decoded.id || decoded.id_usuario || decoded.userId,
      tipo_usuario: decoded.tipo_usuario || decoded.role || 'ciudadano'
    };
    
    console.log('Usuario autenticado:', req.user);
    next();
  } catch (error) {
    console.error('Error en verificación de token:', error);
    
    let message = 'Token inválido';
    if (error.name === 'TokenExpiredError') {
      message = 'Token expirado';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Token malformado';
    }
    
    res.status(401).json({ 
      success: false, 
      message,
      error: error.message 
    });
  }
}