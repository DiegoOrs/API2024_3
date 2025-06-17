import { conmysql } from '../bd.js';
import { handleError } from '../utils/errorHandler.js';

/**
 * Crea una nueva reserva
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const createReserva = async (req, res) => {
  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const { id_disponibilidad, observaciones } = req.body;
    const id_usuario = req.user.id;

    // 1. Validar usuario
    const [user] = await connection.query(
      'SELECT fecha_bloqueo_reservas FROM usuarios WHERE id_usuario = ?',
      [id_usuario]
    );
    
    if (user.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (user[0].fecha_bloqueo_reservas && new Date(user[0].fecha_bloqueo_reservas) > new Date()) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: 'Usuario bloqueado para realizar reservas'
      });
    }

    // 2. Validar disponibilidad
    const [disponibilidad] = await connection.query(
      `SELECT d.*, c.nombre as nombre_cancha 
       FROM disponibilidad d
       JOIN canchas c ON d.id_cancha = c.id_cancha
       WHERE d.id_disponibilidad = ? AND d.estado = 'disponible'`,
      [id_disponibilidad]
    );
    
    if (disponibilidad.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'La disponibilidad seleccionada no está disponible'
      });
    }

    const disp = disponibilidad[0];

    // 3. Validar que no tenga otra reserva en el mismo horario
    const [reservasSolapadas] = await connection.query(
      `SELECT r.id_reserva 
       FROM reservas r
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       WHERE r.id_usuario = ? AND r.estado IN ('pendiente', 'confirmada')
       AND d.fecha = ? AND (
         (d.hora_inicio BETWEEN ? AND ?) OR
         (d.hora_fin BETWEEN ? AND ?) OR
         (? BETWEEN d.hora_inicio AND d.hora_fin) OR
         (? BETWEEN d.hora_inicio AND d.hora_fin)
       )`,
      [
        id_usuario, 
        disp.fecha,
        disp.hora_inicio, disp.hora_fin,
        disp.hora_inicio, disp.hora_fin,
        disp.hora_inicio, disp.hora_fin
      ]
    );

    if (reservasSolapadas.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ya tienes una reserva en este horario'
      });
    }

    // 4. Crear reserva
    const [result] = await connection.query(
      `INSERT INTO reservas 
       (id_usuario, id_disponibilidad, estado, observaciones, fecha_reserva) 
       VALUES (?, ?, 'pendiente', ?, NOW())`,
      [id_usuario, id_disponibilidad, observaciones]
    );

    // 5. La disponibilidad se mantiene como 'disponible' hasta que la reserva sea confirmada por un administrador.

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Reserva creada exitosamente',
      data: {
        id_reserva: result.insertId,
        cancha: disp.nombre_cancha,
        fecha: disp.fecha,
        hora_inicio: disp.hora_inicio,
        hora_fin: disp.hora_fin,
        estado: 'pendiente'
      }
    });

  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'crear reserva');
  } finally {
    connection.release();
  }
};

/**
 * Obtiene las reservas de un usuario
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getReservasByUser = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { estado, fecha_inicio, fecha_fin } = req.query;

    let query = `
      SELECT 
        r.id_reserva, 
        r.fecha_reserva,
        r.estado,
        r.observaciones,
        r.motivo_cancelacion,
        d.id_disponibilidad,
        d.fecha,
        d.hora_inicio,
        d.hora_fin,
        c.id_cancha,
        c.nombre AS nombre_cancha,
        c.direccion AS direccion_cancha,
        c.tipo_deporte
      FROM reservas r
      JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
      JOIN canchas c ON d.id_cancha = c.id_cancha
      WHERE r.id_usuario = ?
    `;

    const params = [id_usuario];

    if (estado) {
      query += ' AND r.estado = ?';
      params.push(estado);
    }

    if (fecha_inicio) {
      query += ' AND d.fecha >= ?';
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      query += ' AND d.fecha <= ?';
      params.push(fecha_fin);
    }

    query += ' ORDER BY d.fecha DESC, d.hora_inicio DESC';

    const [reservas] = await conmysql.query(query, params);

    // Transformar los datos a la estructura esperada
    const reservasFormateadas = reservas.map(r => ({
      id_reserva: r.id_reserva,
      fecha_reserva: r.fecha_reserva,
      estado: r.estado,
      observaciones: r.observaciones,
      motivo_cancelacion: r.motivo_cancelacion,
      disponibilidad: {
        id_disponibilidad: r.id_disponibilidad,
        fecha: r.fecha,
        hora_inicio: r.hora_inicio,
        hora_fin: r.hora_fin,
        cancha: {
          id_cancha: r.id_cancha,
          nombre: r.nombre_cancha,
          direccion: r.direccion_cancha,
          tipo_deporte: r.tipo_deporte
        }
      }
    }));

    res.json({
      success: true,
      data: reservasFormateadas
    });

  } catch (error) {
    console.error('Error al obtener reservas:', error);
    return handleError(res, error, 'obtener reservas');
  }
};

/**
 * Cancela una reserva
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const cancelReserva = async (req, res) => {
  const connection = await conmysql.getConnection();
  
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { motivo } = req.body;
    const id_usuario = req.user.id;

    console.log(`Intentando cancelar reserva ID: ${id}, Usuario: ${id_usuario}`); // Log importante

    // 1. Verificar existencia de la reserva
    const [reserva] = await connection.query(
      `SELECT r.*, d.fecha, d.hora_inicio 
       FROM reservas r
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       WHERE r.id_reserva = ? AND r.id_usuario = ?`,
      [id, id_usuario]
    );

    if (reserva.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reserva no encontrada o no pertenece al usuario' 
      });
    }

    const reservaData = reserva[0];

    // 2. Validar estado actual
    if (reservaData.estado === 'cancelada') {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'La reserva ya está cancelada' 
      });
    }

    // 3. Validar fecha (no cancelar después del horario)
    const fechaReserva = new Date(`${reservaData.fecha} ${reservaData.hora_inicio}`);
    if (fechaReserva < new Date()) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede cancelar una reserva pasada' 
      });
    }

    // 4. Actualizar reserva
    await connection.query(
  `UPDATE reservas 
   SET estado = 'cancelada', 
       motivo_cancelacion = ?
   WHERE id_reserva = ?`,
  [motivo || 'Cancelada por el usuario', id]
);

    // 5. Liberar disponibilidad CONDICIONALMENTE
    // Solo liberar la disponibilidad si la reserva estaba en estado 'pendiente'
    if (reservaData.estado === 'pendiente') {
      await connection.query(
        `UPDATE disponibilidad 
         SET estado = 'disponible' 
         WHERE id_disponibilidad = ?`,
        [reservaData.id_disponibilidad]
      );
    }
    // Si reservaData.estado era 'confirmada', la disponibilidad permanece 'reservado'

    await connection.commit();
    
    console.log(`Reserva ${id} cancelada exitosamente`); // Log de éxito
    
    res.json({ 
      success: true,
      message: 'Reserva cancelada exitosamente',
      data: { id_reserva: id, estado: 'cancelada' }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error en cancelReserva:', error); // Log detallado del error
    
    // Verificar si es un error de MySQL
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        success: false, 
        message: 'Error de integridad referencial en la base de datos' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno al cancelar reserva',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};
/**
 * Confirma una reserva (admin)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const confirmReserva = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const { id } = req.params;

    // 1. Verificar reserva
    const [reserva] = await connection.query(
      `SELECT r.*, d.fecha, d.hora_inicio
       FROM reservas r
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       WHERE r.id_reserva = ? AND r.estado = 'pendiente'`,
      [id]
    );
    
    if (reserva.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada o ya no está pendiente'
      });
    }

    // 2. Actualizar reserva
    await connection.query(
      `UPDATE reservas 
       SET estado = 'confirmada',
           fecha_confirmacion = NOW()
       WHERE id_reserva = ?`,
      [id]
    );

    const id_disponibilidad_confirmada = reserva[0].id_disponibilidad;

    // 3. Actualizar disponibilidad a 'reservado'
    await connection.query(
      'UPDATE disponibilidad SET estado = "reservado" WHERE id_disponibilidad = ?',
      [id_disponibilidad_confirmada]
    );

    // 4. Rechazar otras reservas pendientes para la misma disponibilidad
    await connection.query(
      `UPDATE reservas
       SET estado = 'rechazada',
           motivo_cancelacion = 'Reserva rechazada automáticamente: otra reserva para este horario fue confirmada.'
       WHERE id_disponibilidad = ? AND id_reserva != ? AND estado = 'pendiente'`,
      [id_disponibilidad_confirmada, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Reserva confirmada exitosamente',
      data: {
        id_reserva: id,
        estado: 'confirmada'
      }
    });

  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'confirmar reserva');
  } finally {
    connection.release();
  }
};

/**
 * Marca una reserva como completada
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const marcarReservaCompletada = async (req, res) => {
  const { id } = req.params;

  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Verificar reserva
    const [reserva] = await connection.query(
      `SELECT estado FROM reservas WHERE id_reserva = ?`,
      [id]
    );

    if (reserva.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Reserva no encontrada' 
      });
    }

    // 2. Validar estado
    if (reserva[0].estado !== 'confirmada') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden marcar como completadas las reservas confirmadas'
      });
    }

    // 3. Actualizar reserva
    await connection.query(
      `UPDATE reservas 
       SET estado = 'completada',
           fecha_completado = NOW()
       WHERE id_reserva = ?`,
      [id]
    );

    await connection.commit();

    res.json({ 
      success: true, 
      message: 'Reserva marcada como completada',
      data: {
        id_reserva: id,
        estado: 'completada'
      }
    });

  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'marcar reserva como completada');
  } finally {
    connection.release();
  }
};

/**
 * Obtiene todas las reservas (admin)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getAllReservas = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { estado, fecha_inicio, fecha_fin, id_usuario } = req.query;

    let query = `
      SELECT r.id_reserva, r.fecha_reserva, r.estado, 
             u.nombre as nombre_usuario, u.email as email_usuario,
             d.fecha, d.hora_inicio, d.hora_fin,
             c.nombre as nombre_cancha, c.direccion as direccion_cancha,
             c.tipo_deporte
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
      JOIN canchas c ON d.id_cancha = c.id_cancha
    `;

    const params = [];

    // Filtros opcionales
    if (estado) {
      query += ' WHERE r.estado = ?';
      params.push(estado);
    }

    if (fecha_inicio) {
      query += params.length ? ' AND' : ' WHERE';
      query += ' d.fecha >= ?';
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      query += params.length ? ' AND' : ' WHERE';
      query += ' d.fecha <= ?';
      params.push(fecha_fin);
    }

    if (id_usuario) {
      query += params.length ? ' AND' : ' WHERE';
      query += ' r.id_usuario = ?';
      params.push(id_usuario);
    }

    query += ' ORDER BY d.fecha DESC, d.hora_inicio DESC';

    const [reservas] = await conmysql.query(query, params);

    res.json({
      success: true,
      data: reservas
    });

  } catch (error) {
    return handleError(res, error, 'obtener todas las reservas');
  }
};

export const getHistorialReservas = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { 
      estado, 
      fecha_inicio, 
      fecha_fin, 
      page = 1, 
      limit = 10,
      deporte 
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = `
  SELECT 
    r.id_reserva, 
    r.fecha_reserva, 
    r.estado, 
    r.observaciones, 
    r.motivo_cancelacion,
    /* Elimina estas líneas:
    r.fecha_confirmacion,
    r.fecha_completado,
    */
    d.fecha, 
    d.hora_inicio, 
    d.hora_fin,
    c.id_cancha, 
    c.nombre AS nombre_cancha, 
    c.direccion, 
    c.tipo_deporte,
    c.descripcion_cancha,
    c.latitud,
    c.longitud,
    (
      SELECT COUNT(*) 
      FROM comentarios_reservas cr 
      WHERE cr.id_reserva = r.id_reserva
    ) AS tiene_comentarios
  FROM reservas r
  JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
  JOIN canchas c ON d.id_cancha = c.id_cancha
  WHERE r.id_usuario = ?
`;

    const params = [id_usuario];

    // Filtros
    if (estado && estado !== 'todas') {
      query += ' AND r.estado = ?';
      params.push(estado);
    }

    if (fecha_inicio) {
      query += ' AND d.fecha >= ?';
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      query += ' AND d.fecha <= ?';
      params.push(fecha_fin);
    }

    if (deporte) {
      query += ' AND c.tipo_deporte = ?';
      params.push(deporte);
    }

    // Ordenación y paginación
    query += ' ORDER BY d.fecha DESC, d.hora_inicio DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    // Consulta para el total
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM reservas r
      JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
      JOIN canchas c ON d.id_cancha = c.id_cancha
      WHERE r.id_usuario = ?
    `;
    const countParams = [id_usuario];

    // Aplicar mismos filtros al count
    if (estado && estado !== 'todas') {
      countQuery += ' AND r.estado = ?';
      countParams.push(estado);
    }
    if (fecha_inicio) {
      countQuery += ' AND d.fecha >= ?';
      countParams.push(fecha_inicio);
    }
    if (fecha_fin) {
      countQuery += ' AND d.fecha <= ?';
      countParams.push(fecha_fin);
    }
    if (deporte) {
      countQuery += ' AND c.tipo_deporte = ?';
      countParams.push(deporte);
    }

    const [reservas] = await conmysql.query(query, params);
    const [[{ total }]] = await conmysql.query(countQuery, countParams);

    // Formatear respuesta
    const formattedReservas = reservas.map(reserva => ({
      id_reserva: reserva.id_reserva,
      fecha_reserva: reserva.fecha_reserva,
      estado: reserva.estado,
      observaciones: reserva.observaciones,
      motivo_cancelacion: reserva.motivo_cancelacion,
      fecha_confirmacion: reserva.fecha_confirmacion,
      fecha_completado: reserva.fecha_completado,
      disponibilidad: {
        fecha: reserva.fecha,
        hora_inicio: reserva.hora_inicio,
        hora_fin: reserva.hora_fin,
        cancha: {
          id_cancha: reserva.id_cancha,
          nombre: reserva.nombre_cancha,
          direccion: reserva.direccion,
          tipo_deporte: reserva.tipo_deporte,
          descripcion: reserva.descripcion_cancha,
          coordenadas: {
            latitud: reserva.latitud,
            longitud: reserva.longitud
          }
        }
      },
      puede_comentar: reserva.estado === 'completada' && !reserva.tiene_comentarios
    }));

    res.json({
      success: true,
      data: {
        reservas: formattedReservas,
        paginacion: {
          total,
          pagina_actual: parseInt(page),
          por_pagina: parseInt(limit),
          total_paginas: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error en getHistorialReservas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener historial de reservas',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtiene los detalles completos de una reserva específica con comentarios
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getDetalleReserva = async (req, res) => {
  const connection = await conmysql.getConnection();
  
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;
    const isAdmin = req.user.tipo_usuario === 'administrador';

    // 1. Obtener información básica de la reserva
    let query = `
      SELECT 
        r.*,
        d.fecha, d.hora_inicio, d.hora_fin,
        c.id_cancha, c.nombre as nombre_cancha, c.direccion, 
        c.tipo_deporte, c.descripcion_cancha, c.latitud, c.longitud,
        u.nombre as nombre_usuario, u.email as email_usuario,
        (
          SELECT COUNT(*) 
          FROM comentarios_reservas cr 
          WHERE cr.id_reserva = r.id_reserva
        ) AS tiene_comentarios
      FROM reservas r
      JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
      JOIN canchas c ON d.id_cancha = c.id_cancha
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      WHERE r.id_reserva = ?
    `;

    const params = [id];

    if (!isAdmin) {
      query += ' AND r.id_usuario = ?';
      params.push(id_usuario);
    }

    const [reserva] = await connection.query(query, params);

    if (reserva.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada o no tienes permisos para verla'
      });
    }

    const reservaData = reserva[0];

    // 2. Obtener comentarios si existen
    const [comentarios] = await connection.query(`
      SELECT 
        cr.id_comentario,
        cr.comentario,
        cr.fecha_comentario,
        cr.calificacion,
        u.id_usuario,
        u.nombre as nombre_usuario,
        pc.foto_perfil
      FROM comentarios_reservas cr
      JOIN usuarios u ON cr.id_usuario = u.id_usuario
      LEFT JOIN perfiles_ciudadanos pc ON u.id_usuario = pc.id_usuario
      WHERE cr.id_reserva = ?
      ORDER BY cr.fecha_comentario DESC
    `, [id]);

    // 3. Formatear respuesta
    const response = {
      id_reserva: reservaData.id_reserva,
      fecha_reserva: reservaData.fecha_reserva,
      estado: reservaData.estado,
      observaciones: reservaData.observaciones,
      motivo_cancelacion: reservaData.motivo_cancelacion,
      fecha_confirmacion: reservaData.fecha_confirmacion,
      fecha_completado: reservaData.fecha_completado,
      usuario: {
        id_usuario: reservaData.id_usuario,
        nombre: reservaData.nombre_usuario,
        email: reservaData.email_usuario
      },
      disponibilidad: {
        fecha: reservaData.fecha,
        hora_inicio: reservaData.hora_inicio,
        hora_fin: reservaData.hora_fin,
        cancha: {
          id_cancha: reservaData.id_cancha,
          nombre: reservaData.nombre_cancha,
          direccion: reservaData.direccion,
          tipo_deporte: reservaData.tipo_deporte,
          descripcion: reservaData.descripcion_cancha,
          coordenadas: {
            latitud: reservaData.latitud,
            longitud: reservaData.longitud
          }
        }
      },
      comentarios: comentarios.map(c => ({
        id_comentario: c.id_comentario,
        comentario: c.comentario,
        calificacion: c.calificacion,
        fecha_comentario: c.fecha_comentario,
        usuario: {
          id_usuario: c.id_usuario,
          nombre: c.nombre_usuario,
          foto_perfil: c.foto_perfil || 'assets/avatar-default.png'
        }
      })),
      puede_comentar: !isAdmin && 
                     reservaData.estado === 'completada' && 
                     !reservaData.tiene_comentarios &&
                     reservaData.id_usuario === id_usuario
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    return handleError(res, error, 'obtener detalle de reserva');
  } finally {
    connection.release();
  }
};

/**
 * Obtiene los detalles de una reserva específica
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getReservaById = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;
    const isAdmin = req.user.tipo_usuario === 'administrador';

    let query = `
      SELECT r.*, 
             u.nombre as nombre_usuario, u.email as email_usuario,
             d.fecha, d.hora_inicio, d.hora_fin, d.id_cancha,
             c.nombre as nombre_cancha, c.direccion as direccion_cancha,
             c.tipo_deporte, c.descripcion as descripcion_cancha
      FROM reservas r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
      JOIN canchas c ON d.id_cancha = c.id_cancha
      WHERE r.id_reserva = ?
    `;

    const params = [id];

    if (!isAdmin) {
      query += ' AND r.id_usuario = ?';
      params.push(id_usuario);
    }

    const [reserva] = await conmysql.query(query, params);

    if (reserva.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada'
      });
    }

    res.json({
      success: true,
      data: reserva[0]
    });

  } catch (error) {
    return handleError(res, error, 'obtener reserva por ID');
  }
};