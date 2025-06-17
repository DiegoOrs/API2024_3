import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { conmysql } from '../bd.js';
import { JWT_SECRET } from '../config.js';
import { upload } from '../config/multer.js';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: 'dhttyci5g',
  api_key: '665522465541433',
  api_secret: '4qXzO8uGt7UM9_o6NrlJZ50-18o'
});

function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

// Registrar nuevo usuario
export const registerUser = async (req, res) => {
  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const { nombre, email, contrasena, telefono, direccion, fecha_nacimiento, genero, ocupacion, biografia, red_social } = req.body;
    const tipo_usuario = 'ciudadano';

    if (!nombre || !email || !contrasena || !fecha_nacimiento || !genero) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }

    if (!['masculino', 'femenino', 'otro'].includes(genero.toLowerCase())) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Género no válido' });
    }

    const [existingUser] = await connection.query('SELECT id_usuario FROM usuarios WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El correo ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const [userResult] = await connection.query(
      `INSERT INTO usuarios (tipo_usuario, nombre, email, contrasena, telefono, direccion) VALUES (?, ?, ?, ?, ?, ?)`,
      [tipo_usuario, nombre, email, hashedPassword, telefono, direccion]
    );
    const userId = userResult.insertId;

    let fotoPerfilUrl = null;
    if (req.file && req.file.buffer) {
      fotoPerfilUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: 'usuarios_perfiles',
          transformation: { width: 500, height: 500, crop: 'limit' }
        }, async (error, result) => {
          if (error) {
            await connection.rollback();
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        });
        bufferToStream(req.file.buffer).pipe(stream);
      });
    }

    await connection.query(
      `INSERT INTO perfiles_ciudadanos (id_usuario, foto_perfil, fecha_nacimiento, genero, ocupacion, biografia, red_social) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, fotoPerfilUrl, fecha_nacimiento, genero, ocupacion, biografia, red_social]
    );

    const token = jwt.sign({ id: userId, tipo_usuario }, JWT_SECRET, { expiresIn: '24h' });

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        token,
        user: { id: userId, nombre, email, tipo_usuario },
        foto_perfil: fotoPerfilUrl
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error en registerUser:', error);
    res.status(500).json({ success: false, message: 'Error al registrar usuario', error: error.message });
  } finally {
    connection.release();
  }
};

// Iniciar sesión
export const loginUser = async (req, res) => {
  try {
    const { email, contrasena } = req.body;
    const [users] = await conmysql.query(
      `SELECT id_usuario, nombre, email, tipo_usuario, contrasena, activo FROM usuarios WHERE email = ? AND activo = 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado o inactivo' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(contrasena, user.contrasena);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ id: user.id_usuario, tipo_usuario: user.tipo_usuario }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token,
        user: {
          id: user.id_usuario,
          nombre: user.nombre,
          email: user.email,
          tipo_usuario: user.tipo_usuario
        }
      }
    });
  } catch (error) {
    console.error('Error en loginUser:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar sesión', error: error.message });
  }
};


// Obtener perfil de usuario
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    // Obtener datos básicos del usuario
    const [users] = await conmysql.query(
      `SELECT id_usuario, tipo_usuario, nombre, email, telefono, direccion, fecha_registro 
       FROM usuarios WHERE id_usuario = ? AND activo = 1`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    const user = users[0];
    const response = { user };

    // Si es ciudadano, obtener perfil
    if (user.tipo_usuario === 'ciudadano') {
      const [profiles] = await conmysql.query(
        `SELECT id_perfil_ciudadano, foto_perfil, fecha_nacimiento, genero, 
                ocupacion, biografia, red_social 
         FROM perfiles_ciudadanos WHERE id_usuario = ?`,
        [userId]
      );

      if (profiles.length > 0) {
        response.perfil = profiles[0];
      }
    }

    res.json({
      success: true,
      message: 'Perfil obtenido exitosamente',
      data: response
    });

  } catch (error) {
    return handleError(res, error, 'obtener perfil');
  }
};

// Actualizar perfil de usuario
export const updateUserProfile = async (req, res) => {
  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.user.id;
    const { nombre, telefono, direccion, fecha_nacimiento, genero, ocupacion, biografia, red_social } = req.body;

    // Actualizar datos básicos
    await connection.query(
      `UPDATE usuarios 
       SET nombre = ?, telefono = ?, direccion = ? 
       WHERE id_usuario = ?`,
      [nombre, telefono, direccion, userId]
    );

    // Verificar tipo de usuario
    const [user] = await connection.query(
      'SELECT tipo_usuario FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    if (user[0].tipo_usuario === 'ciudadano') {
      // Procesar imagen si se envió
      let fotoPerfilUrl = null;
      if (req.file) {
        try {
          // Eliminar imagen anterior si existe
          const [profile] = await connection.query(
            'SELECT foto_perfil FROM perfiles_ciudadanos WHERE id_usuario = ?',
            [userId]
          );

          if (profile.length > 0 && profile[0].foto_perfil) {
            const urlParts = profile[0].foto_perfil.split('/');
            const publicId = urlParts[urlParts.length - 1].split('.')[0];
            await cloudinary.uploader.destroy(`usuarios_perfiles/${publicId}`);
          }

          // Subir nueva imagen
          const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            folder: 'usuarios_perfiles',
            transformation: { width: 500, height: 500, crop: 'limit' }
          });
          fotoPerfilUrl = uploadResult.secure_url;
        } catch (error) {
          await connection.rollback();
          return handleError(res, error, 'actualizar imagen de perfil');
        }
      }

      // Actualizar o crear perfil
      const [profile] = await connection.query(
        'SELECT id_perfil_ciudadano FROM perfiles_ciudadanos WHERE id_usuario = ?',
        [userId]
      );

      if (profile.length > 0) {
        await connection.query(
          `UPDATE perfiles_ciudadanos 
           SET fecha_nacimiento = ?, genero = ?, ocupacion = ?, 
               biografia = ?, red_social = ?, ${fotoPerfilUrl ? 'foto_perfil = ?,' : ''}
               fecha_actualizacion = CURRENT_TIMESTAMP 
           WHERE id_usuario = ?`,
          [fecha_nacimiento, genero, ocupacion, biografia, red_social, ...(fotoPerfilUrl ? [fotoPerfilUrl] : []), userId]
        );
      } else {
        await connection.query(
          `INSERT INTO perfiles_ciudadanos 
           (id_usuario, foto_perfil, fecha_nacimiento, genero, ocupacion, biografia, red_social) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, fotoPerfilUrl, fecha_nacimiento, genero, ocupacion, biografia, red_social]
        );
      }
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'actualizar perfil');
  } finally {
    connection.release();
  }
};



export const obtenerPerfilUsuario = async (req, res) => {
  const connection = await conmysql.getConnection();
  
  try {
    const userId = req.user.id;

    // Validación básica del ID
    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido'
      });
    }

    const [users] = await connection.query(
      `SELECT 
        u.id_usuario, u.tipo_usuario, u.nombre, u.email, 
        u.telefono, u.direccion, u.fecha_registro,
        pc.foto_perfil, pc.fecha_nacimiento, pc.genero,
        pc.ocupacion, pc.biografia, pc.red_social,
        (SELECT COUNT(*) FROM sanciones s 
         WHERE s.id_usuario = u.id_usuario AND s.activa = 1) as sanciones_activas
       FROM usuarios u
       LEFT JOIN perfiles_ciudadanos pc ON u.id_usuario = pc.id_usuario
       WHERE u.id_usuario = ?`, 
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    const userData = users[0];
    
    // Formatear respuesta
    const response = {
      id_usuario: userData.id_usuario,
      tipo_usuario: userData.tipo_usuario,
      nombre: userData.nombre,
      email: userData.email,
      telefono: userData.telefono || null,
      direccion: userData.direccion || null,
      foto_perfil: userData.foto_perfil || null,
      fecha_nacimiento: userData.fecha_nacimiento ? 
        new Date(userData.fecha_nacimiento).toISOString().split('T')[0] : null,
      genero: userData.genero || null,
      ocupacion: userData.ocupacion || null,
      biografia: userData.biografia || null,
      red_social: userData.red_social || null,
      fecha_registro: userData.fecha_registro.toISOString(),
      sanciones_activas: userData.sanciones_activas || 0
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error en obtenerPerfilUsuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener perfil',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};
export const actualizarPerfil = async (req, res) => {
  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.user.id;
    const { nombre, telefono, direccion, fecha_nacimiento, genero } = req.body;

    // Actualizar datos básicos
    await connection.query(
      `UPDATE usuarios 
       SET nombre = ?, telefono = ?, direccion = ? 
       WHERE id_usuario = ?`,
      [nombre, telefono, direccion, userId]
    );

    // Verificar tipo de usuario
    const [user] = await connection.query(
      'SELECT tipo_usuario FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    if (user[0].tipo_usuario === 'ciudadano') {
      // Actualizar perfil ciudadano
      await connection.query(
        `UPDATE perfiles_ciudadanos 
         SET fecha_nacimiento = ?, genero = ?
         WHERE id_usuario = ?`,
        [fecha_nacimiento, genero, userId]
      );
    }

    await connection.commit();
    
    // Obtener perfil actualizado
    const [updatedUser] = await connection.query(
      `SELECT u.*, pc.foto_perfil, pc.fecha_nacimiento, pc.genero
       FROM usuarios u
       LEFT JOIN perfiles_ciudadanos pc ON u.id_usuario = pc.id_usuario
       WHERE u.id_usuario = ?`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: updatedUser[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar perfil',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};
export const cambiarFotoPerfil = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se proporcionó ninguna imagen' 
      });
    }

    // Subir a Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { 
          folder: 'usuarios_perfiles',
          transformation: { width: 500, height: 500, crop: 'fill' }
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      stream.end(req.file.buffer);
    });

    // Actualizar en la base de datos
    const [perfilExistente] = await conmysql.query(
      'SELECT * FROM perfiles_ciudadanos WHERE id_usuario = ?',
      [userId]
    );

    if (perfilExistente.length > 0) {
      // Eliminar imagen anterior de Cloudinary si existe
      if (perfilExistente[0].foto_perfil) {
        const publicId = perfilExistente[0].foto_perfil.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`usuarios_perfiles/${publicId}`);
      }

      await conmysql.query(
        'UPDATE perfiles_ciudadanos SET foto_perfil = ? WHERE id_usuario = ?',
        [result.secure_url, userId]
      );
    } else {
      await conmysql.query(
        'INSERT INTO perfiles_ciudadanos (id_usuario, foto_perfil) VALUES (?, ?)',
        [userId, result.secure_url]
      );
    }

    res.json({ 
      success: true, 
      message: 'Foto de perfil actualizada',
      fotoUrl: result.secure_url 
    });

  } catch (error) {
    console.error('Error en cambiarFotoPerfil:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al cambiar la foto de perfil',
      error: error.message 
    });
  }
};
export const getAllCiudadanos = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const [ciudadanos] = await conmysql.query(
      `SELECT 
        u.id_usuario, u.nombre, u.email, u.telefono, u.direccion, 
        u.fecha_registro, u.activo, u.fecha_bloqueo_reservas,
        pc.foto_perfil, pc.fecha_nacimiento, pc.genero, pc.ocupacion,
        (SELECT COUNT(*) FROM sanciones s 
         WHERE s.id_usuario = u.id_usuario AND s.activa = 1 AND s.fecha_fin > NOW()) as sanciones_activas,
        (SELECT COUNT(*) FROM reservas r 
         WHERE r.id_usuario = u.id_usuario) as total_reservas,
        (SELECT COUNT(*) FROM reservas r 
         WHERE r.id_usuario = u.id_usuario AND r.estado = 'cancelada') as reservas_canceladas
       FROM usuarios u
       LEFT JOIN perfiles_ciudadanos pc ON u.id_usuario = pc.id_usuario
       WHERE u.tipo_usuario = 'ciudadano'
       ORDER BY u.fecha_registro DESC`
    );

    res.json({
      success: true,
      data: ciudadanos
    });
  } catch (error) {
    console.error('Error en getAllCiudadanos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener ciudadanos',
      error: error.message 
    });
  }
};

// Nuevo endpoint para obtener reservas de un ciudadano específico (solo administradores)
export const getReservasCiudadano = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id_usuario } = req.params;
    
    const [reservas] = await conmysql.query(
      `SELECT 
        r.id_reserva, r.fecha_reserva, r.estado, r.observaciones, r.motivo_cancelacion,
        d.fecha, d.hora_inicio, d.hora_fin,
        c.nombre as cancha_nombre, c.direccion as cancha_direccion, c.tipo_deporte,
        u.nombre as usuario_nombre, u.email as usuario_email
       FROM reservas r
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       JOIN canchas c ON d.id_cancha = c.id_cancha
       JOIN usuarios u ON r.id_usuario = u.id_usuario
       WHERE r.id_usuario = ?
       ORDER BY d.fecha DESC, d.hora_inicio DESC`,
      [id_usuario]
    );

    res.json({
      success: true,
      data: reservas
    });
  } catch (error) {
    console.error('Error en getReservasCiudadano:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener reservas del ciudadano',
      error: error.message 
    });
  }
};

// Nuevo endpoint para aplicar sanción a un ciudadano (solo administradores)
export const aplicarSancionCiudadano = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const { id_usuario, motivo, dias_sancion, id_reserva } = req.body;
    
    // Validar que el usuario existe y es ciudadano
    const [usuario] = await connection.query(
      'SELECT id_usuario, nombre, tipo_usuario FROM usuarios WHERE id_usuario = ? AND tipo_usuario = "ciudadano"',
      [id_usuario]
    );

    if (usuario.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Ciudadano no encontrado'
      });
    }

    // Calcular fecha de fin de sanción
    const fecha_fin = new Date();
    fecha_fin.setDate(fecha_fin.getDate() + parseInt(dias_sancion));
    
    // Crear sanción
    const [result] = await connection.query(
      `INSERT INTO sanciones 
      (id_usuario, id_reserva, motivo, fecha_fin, activa) 
      VALUES (?, ?, ?, ?, 1)`,
      [id_usuario, id_reserva || null, motivo, fecha_fin]
    );
    
    // Bloquear usuario para reservas
    await connection.query(
      'UPDATE usuarios SET fecha_bloqueo_reservas = ? WHERE id_usuario = ?',
      [fecha_fin, id_usuario]
    );

    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: `Sanción aplicada exitosamente a ${usuario[0].nombre}`,
      data: { 
        id_sancion: result.insertId,
        usuario: usuario[0].nombre,
        motivo,
        fecha_fin: fecha_fin.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error en aplicarSancionCiudadano:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al aplicar sanción',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};



// Eliminar usuario
export const deleteUser = async (req, res) => {
  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.params.id;
    const requestingUserId = req.user.id;

    // Verificar permisos
    if (requestingUserId !== userId && req.user.tipo_usuario !== 'administrador') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para esta acción'
      });
    }

    // Obtener datos del usuario
    const [user] = await connection.query(
      'SELECT tipo_usuario FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    if (user.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Eliminar relaciones primero
    if (user[0].tipo_usuario === 'ciudadano') {
      // Eliminar imagen de perfil si existe
      const [profile] = await connection.query(
        'SELECT foto_perfil FROM perfiles_ciudadanos WHERE id_usuario = ?',
        [userId]
      );

      if (profile.length > 0 && profile[0].foto_perfil) {
        try {
          const urlParts = profile[0].foto_perfil.split('/');
          const publicId = urlParts[urlParts.length - 1].split('.')[0];
          await cloudinary.uploader.destroy(`usuarios_perfiles/${publicId}`);
        } catch (error) {
          console.error('Error al eliminar imagen:', error);
        }
      }

      await connection.query('DELETE FROM perfiles_ciudadanos WHERE id_usuario = ?', [userId]);
    }

    // Eliminar reservas y comentarios del usuario
    await connection.query('DELETE FROM comentarios_reservas WHERE id_usuario = ?', [userId]);
    
    // Obtener reservas para liberar disponibilidades
    const [reservas] = await connection.query(
      'SELECT id_disponibilidad FROM reservas WHERE id_usuario = ?',
      [userId]
    );
    
    await connection.query('DELETE FROM reservas WHERE id_usuario = ?', [userId]);
    
    // Liberar disponibilidades
    for (const reserva of reservas) {
      await connection.query(
        'UPDATE disponibilidad SET estado = "disponible" WHERE id_disponibilidad = ?',
        [reserva.id_disponibilidad]
      );
    }

    // Finalmente eliminar usuario
    await connection.query('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
    await connection.commit();

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'eliminar usuario');
  } finally {
    connection.release();
  }
};



export { upload };