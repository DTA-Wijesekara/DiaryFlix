const sql = require('mssql/msnodesqlv8');

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;'
};

async function test() {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT 1 as num');
    console.log('Success:', result.recordset);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
