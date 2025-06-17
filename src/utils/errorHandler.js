export function handleError(res, error, action) {
  console.error(`Error al ${action}:`, error);
  
  let statusCode = 500;
  let message = `Error al ${action}`;
  
  if (error.code === 'ER_DUP_ENTRY') {
    statusCode = 400;
    message = 'El registro ya existe';
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'Referencia a registro inexistente';
  }
  
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}