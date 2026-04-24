const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { initDB, getPool, sql } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'cinelog_super_secret_key_123!';

// Middleware to authenticate JWT
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// ---- Auth Routes ----

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email || !password || !displayName) return res.status(400).json({ error: 'Missing fields' });

        const pool = await getPool();
        const existing = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id FROM Users WHERE email = @email');
        
        if (existing.recordset.length > 0) return res.status(400).json({ error: 'Email already in use' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const avatar = '🎬';

        await pool.request()
            .input('id', sql.VarChar, id)
            .input('email', sql.VarChar, email)
            .input('displayName', sql.VarChar, displayName)
            .input('passwordHash', sql.VarChar, hash)
            .input('salt', sql.VarChar, salt)
            .input('avatar', sql.VarChar, avatar)
            .query(`
                INSERT INTO Users (id, email, displayName, passwordHash, salt, avatar, isActive, role, createdAt, lastLogin)
                VALUES (@id, @email, @displayName, @passwordHash, @salt, @avatar, 1, 'user', GETDATE(), GETDATE())
            `);

        const token = jwt.sign({ id, email, role: 'user' }, JWT_SECRET);
        res.json({ token, user: { id, email, displayName, role: 'user', avatar } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM Users WHERE email = @email');
            
        if (result.recordset.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

        const user = result.recordset[0];
        if (!user.isActive) return res.status(403).json({ error: 'Account is deactivated' });

        const validPass = await bcrypt.compare(password, user.passwordHash);
        if (!validPass) return res.status(400).json({ error: 'Invalid credentials' });

        await pool.request()
            .input('id', sql.VarChar, user.id)
            .query('UPDATE Users SET lastLogin = GETDATE() WHERE id = @id');

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
        res.json({ 
            token, 
            user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatar: user.avatar } 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/auth/me', authenticateJWT, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.VarChar, req.user.id)
            .query('SELECT id, email, displayName, role, avatar, isActive FROM Users WHERE id = @id');
        
        if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: result.recordset[0] });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ---- WatchLogs Routes ----

app.get('/api/logs', authenticateJWT, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.VarChar, req.user.id)
            .query('SELECT * FROM WatchLogs WHERE userId = @userId ORDER BY createdAt DESC');
        
        const logs = result.recordset.map(log => ({
            ...log,
            actors: JSON.parse(log.actors || '[]'),
            actresses: JSON.parse(log.actresses || '[]'),
            favouriteSongs: JSON.parse(log.favouriteSongs || '[]'),
            favouriteQuotes: JSON.parse(log.favouriteQuotes || '[]')
        }));
        
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/logs', authenticateJWT, async (req, res) => {
    try {
        const log = req.body;
        const id = 'log_' + Date.now().toString(36);
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.VarChar, id)
            .input('userId', sql.VarChar, req.user.id)
            .input('title', sql.VarChar, log.title)
            .input('dateWatched', sql.VarChar, log.dateWatched)
            .input('actors', sql.NVarChar, JSON.stringify(log.actors || []))
            .input('actresses', sql.NVarChar, JSON.stringify(log.actresses || []))
            .input('category', sql.VarChar, log.category)
            .input('rating', sql.Int, log.rating || 0)
            .input('industry', sql.VarChar, log.industry || 'other')
            .input('moodBefore', sql.VarChar, log.moodBefore)
            .input('favouriteSongs', sql.NVarChar, JSON.stringify(log.favouriteSongs || []))
            .input('favouriteQuotes', sql.NVarChar, JSON.stringify(log.favouriteQuotes || []))
            .input('notes', sql.NVarChar, log.notes || '')
            .query(`
                INSERT INTO WatchLogs 
                (id, userId, title, dateWatched, actors, actresses, category, rating, industry, moodBefore, favouriteSongs, favouriteQuotes, notes, rewatchCount, createdAt, updatedAt)
                VALUES (@id, @userId, @title, @dateWatched, @actors, @actresses, @category, @rating, @industry, @moodBefore, @favouriteSongs, @favouriteQuotes, @notes, 0, GETDATE(), GETDATE())
            `);
            
        res.json({ id, ...log });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/logs/:id/rewatch', authenticateJWT, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .input('userId', sql.VarChar, req.user.id)
            .query(`
                UPDATE WatchLogs 
                SET rewatchCount = rewatchCount + 1, lastRewatched = GETDATE(), updatedAt = GETDATE()
                WHERE id = @id AND userId = @userId
            `);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/logs/:id', authenticateJWT, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .input('userId', sql.VarChar, req.user.id)
            .query('DELETE FROM WatchLogs WHERE id = @id AND userId = @userId');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ---- Start Server ----

const PORT = 5000;
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
});
