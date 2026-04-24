const sql = require('mssql/msnodesqlv8');
const bcrypt = require('bcryptjs');

const serverName = 'localhost';
const dbName = 'cinemadiary';

const masterConfig = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;'
};

// Configuration for our actual database
const dbConfig = {
  connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=${dbName};Trusted_Connection=yes;TrustServerCertificate=yes;`
};

async function initDB() {
  try {
    console.log("Connecting to master database...");
    // 1. Create database if not exists
    let pool = await sql.connect(masterConfig);
    const dbCheck = await pool.request().query(`
      SELECT * FROM sys.databases WHERE name = '${dbName}'
    `);
    
    if (dbCheck.recordset.length === 0) {
      console.log(`Database ${dbName} does not exist. Creating...`);
      await pool.request().query(`CREATE DATABASE [${dbName}]`);
      console.log(`Database ${dbName} created successfully.`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
    await pool.close();

    // 2. Connect to the new database and create tables
    console.log(`Connecting to ${dbName}...`);
    pool = await sql.connect(dbConfig);
    
    // Users table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U')
      CREATE TABLE Users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        displayName VARCHAR(255) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        avatar VARCHAR(255),
        isActive BIT DEFAULT 1,
        createdAt DATETIME DEFAULT GETDATE(),
        lastLogin DATETIME
      )
    `);

    // WatchLogs table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WatchLogs' and xtype='U')
      CREATE TABLE WatchLogs (
        id VARCHAR(100) PRIMARY KEY,
        userId VARCHAR(100) FOREIGN KEY REFERENCES Users(id),
        title VARCHAR(255) NOT NULL,
        dateWatched VARCHAR(100),
        actors NVARCHAR(MAX),
        actresses NVARCHAR(MAX),
        category VARCHAR(100),
        rating INT,
        industry VARCHAR(100),
        moodBefore VARCHAR(100),
        favouriteSongs NVARCHAR(MAX),
        favouriteQuotes NVARCHAR(MAX),
        notes NVARCHAR(MAX),
        rewatchCount INT DEFAULT 0,
        lastRewatched VARCHAR(100),
        createdAt DATETIME DEFAULT GETDATE(),
        updatedAt DATETIME DEFAULT GETDATE()
      )
    `);

    console.log("Tables verified/created.");

    // Create default admin user if no admin exists
    const adminCheck = await pool.request().query(`SELECT * FROM Users WHERE role = 'admin'`);
    if (adminCheck.recordset.length === 0) {
      console.log("Creating default admin user...");
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('admin123', salt);
      const adminId = 'admin_' + Date.now().toString(36);
      
      await pool.request()
        .input('id', sql.VarChar, adminId)
        .input('email', sql.VarChar, 'admin@cinelog.com')
        .input('displayName', sql.VarChar, 'Admin')
        .input('passwordHash', sql.VarChar, hash)
        .input('salt', sql.VarChar, salt)
        .input('role', sql.VarChar, 'admin')
        .input('avatar', sql.VarChar, '👑')
        .input('isActive', sql.Bit, 1)
        .query(`
          INSERT INTO Users (id, email, displayName, passwordHash, salt, role, avatar, isActive)
          VALUES (@id, @email, @displayName, @passwordHash, @salt, @role, @avatar, @isActive)
        `);
      console.log("Default admin created.");
    }

    return pool;
  } catch (err) {
    console.error("Database initialization error:", err);
    throw err;
  }
}

async function getPool() {
    return await sql.connect(dbConfig);
}

module.exports = { initDB, getPool, sql };
