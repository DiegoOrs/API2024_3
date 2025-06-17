import dotenv from 'dotenv';

dotenv.config();

// Configuración de JWT
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
export const BD_HOST = process.env.BD_HOST || "bybaipojapwijtr27qbf-mysql.services.clever-cloud.com";
export const BD_DATABASE = process.env.BD_DATABASE || "bybaipojapwijtr27qbf";
export const DB_USER = process.env.DB_USER || "uj5z0hr3pbwckb92";
export const DB_PASSWORD = process.env.DB_PASSWORD || "sMVZO8HEiSjpnWzief1a";
export const DB_PORT = process.env.DB_PORT || 3306;
export const PORT = process.env.PORT || 3000;
export const JWT_SECRET = process.env.JWT_SECRET || "clave_secreta_para_jwt_reservas_salinas";
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "dhttyci5g";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "665522465541433";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "4qXzO8uGt7UM9_o6NrlJZ50-18o";
// Otras configuraciones
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5242880; // 5MB por defecto
