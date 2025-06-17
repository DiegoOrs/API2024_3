import bcrypt from 'bcrypt';

async function generateHash() {
  const password = '12345'; // Cambia aquí por la contraseña que quieres para el admin
  const saltRounds = 10; // Nivel de seguridad del hash (10 está bien para la mayoría)
  
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('Hash generado:', hash);
}

generateHash();
