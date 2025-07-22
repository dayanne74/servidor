require('dotenv').config();    
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors'); // Agregar CORS

const app = express();
const PORT = process.env.PORT || 4000;

// Configurar CORS para permitir peticiones desde cualquier origen
app.use(cors({
    origin: '*', // En producción, especifica los dominios permitidos
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
}));

// Configurar middleware
app.use(express.json({ limit: '50mb' })); // Aumentamos el límite para múltiples imágenes
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware de logging para debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Configurar multer para archivos múltiples dinámicos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${timestamp}-${originalName}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB límite por archivo
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'), false);
        }
    }
});

// Configuración de PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 40000,
  connectionTimeoutMillis: 5000,
});

// Variables globales para base de datos
let dbInitialized = false;

// Función para inicializar la base de datos ACTUALIZADA PARA IMÁGENES DINÁMICAS
async function initializeDatabase() {
    try {
        console.log('🔧 Inicializando base de datos PostgreSQL para soporte técnico con imágenes dinámicas...');
        
        // Verificar conexión
        await pool.query('SELECT NOW()');
        console.log('✅ Conectado a PostgreSQL exitosamente');
        
        // NUEVA ESTRUCTURA PARA SOPORTE TÉCNICO CON IMÁGENES DINÁMICAS
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS computadores (
                -- Identificación básica
                id SERIAL PRIMARY KEY,
                equipo_id VARCHAR(100) UNIQUE NOT NULL,
                serial_number VARCHAR(100) NOT NULL,
                placa_ml VARCHAR(100),
                
                -- Ubicación automática
                latitud DECIMAL(10, 8),
                longitud DECIMAL(11, 8),
                direccion_automatica TEXT,
                ubicacion_manual TEXT,
                
                -- Responsable
                responsable VARCHAR(200) NOT NULL,
                cargo VARCHAR(100) NOT NULL,
                
                -- Estado técnico (lo importante para soporte)
                estado VARCHAR(20) NOT NULL CHECK (estado IN ('operativo', 'mantenimiento', 'dañado')),
                windows_update VARCHAR(5) NOT NULL CHECK (windows_update IN ('si', 'no')),
                
                -- CAMPO JSON PARA MÚLTIPLES IMÁGENES DINÁMICAS
                imagenes JSONB DEFAULT '[]'::jsonb,
                
                -- Observaciones técnicas
                observaciones TEXT,
                problemas_detectados TEXT,
                
                -- Control de revisiones
                fecha_revision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                revisor VARCHAR(100)
            )
        `;
        
        await pool.query(createTableSQL);
        console.log('✅ Tabla de soporte técnico con imágenes dinámicas creada/verificada');

        // Migrar datos existentes si hay columnas de fotos individuales
        try {
            const migrateSQL = `
                DO $$
                BEGIN
                    -- Verificar si existen las columnas antiguas
                    IF EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name = 'computadores' 
                              AND column_name IN ('foto_frontal', 'foto_serial', 'foto_placa')) THEN
                        
                        -- Migrar datos existentes al nuevo formato JSON
                        UPDATE computadores 
                        SET imagenes = (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'title', 
                                    CASE 
                                        WHEN col_name = 'foto_frontal' THEN 'Foto frontal del equipo'
                                        WHEN col_name = 'foto_serial' THEN 'Número de serie'
                                        WHEN col_name = 'foto_placa' THEN 'Placa/código ML'
                                    END,
                                    'filename', 
                                    CASE 
                                        WHEN col_name = 'foto_frontal' AND foto_frontal IS NOT NULL THEN substring(foto_frontal from '[^/]*$')
                                        WHEN col_name = 'foto_serial' AND foto_serial IS NOT NULL THEN substring(foto_serial from '[^/]*$')
                                        WHEN col_name = 'foto_placa' AND foto_placa IS NOT NULL THEN substring(foto_placa from '[^/]*$')
                                    END
                                )
                            )
                            FROM (
                                SELECT 'foto_frontal' as col_name
                                UNION SELECT 'foto_serial'
                                UNION SELECT 'foto_placa'
                            ) cols
                            WHERE (col_name = 'foto_frontal' AND foto_frontal IS NOT NULL)
                               OR (col_name = 'foto_serial' AND foto_serial IS NOT NULL) 
                               OR (col_name = 'foto_placa' AND foto_placa IS NOT NULL)
                        )
                        WHERE (foto_frontal IS NOT NULL OR foto_serial IS NOT NULL OR foto_placa IS NOT NULL)
                          AND (imagenes IS NULL OR imagenes = '[]'::jsonb);
                        
                        RAISE NOTICE 'Migración de imágenes completada';
                        
                        -- Opcional: eliminar columnas antiguas después de la migración
                        -- ALTER TABLE computadores DROP COLUMN IF EXISTS foto_frontal;
                        -- ALTER TABLE computadores DROP COLUMN IF EXISTS foto_serial;
                        -- ALTER TABLE computadores DROP COLUMN IF EXISTS foto_placa;
                        
                    END IF;
                END $$;
            `;
            
            await pool.query(migrateSQL);
            console.log('✅ Migración de datos completada');
            
        } catch (migrateError) {
            console.log('ℹ️ No se requiere migración o ya se completó');
        }
        
        // Crear índices para mejor rendimiento
        const indices = [
            'CREATE INDEX IF NOT EXISTS idx_serial_number ON computadores(serial_number)',
            'CREATE INDEX IF NOT EXISTS idx_equipo_id ON computadores(equipo_id)',
            'CREATE INDEX IF NOT EXISTS idx_estado ON computadores(estado)',
            'CREATE INDEX IF NOT EXISTS idx_revisor ON computadores(revisor)',
            'CREATE INDEX IF NOT EXISTS idx_fecha_revision ON computadores(fecha_revision)',
            'CREATE INDEX IF NOT EXISTS idx_imagenes_gin ON computadores USING GIN (imagenes)' // Índice GIN para búsquedas en JSON
        ];
        
        for (const indexSQL of indices) {
            await pool.query(indexSQL);
        }
        
        console.log('✅ Índices de soporte técnico creados');
        dbInitialized = true;
        
    } catch (error) {
        console.error('❌ Error al inicializar base de datos:', error);
        throw error;
    }
}

// Middleware para verificar que la DB esté lista
function checkDatabase(req, res, next) {
    if (!dbInitialized) {
        console.error('Base de datos no inicializada');
        return res.status(500).json({ 
            error: 'Base de datos no disponible',
            details: 'La base de datos no se ha inicializado correctamente'
        });
    }
    next();
}

// Función para procesar imágenes desde base64
function processImageFromBase64(base64Data, prefix = 'image') {
    try {
        if (!base64Data || !base64Data.includes(',')) {
            return null;
        }
        
        const matches = base64Data.match(/^data:image\/([a-zA-Z]*);base64,(.*)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Formato base64 inválido');
        }
        
        const imageType = matches[1];
        const imageData = matches[2];
        const buffer = Buffer.from(imageData, 'base64');
        
        // Generar nombre único
        const timestamp = Date.now();
        const filename = `${timestamp}-${prefix}.${imageType}`;
        const filepath = path.join('uploads', filename);
        
        // Crear directorio si no existe
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Guardar archivo
        fs.writeFileSync(filepath, buffer);
        
        return filename;
        
    } catch (error) {
        console.error('Error procesando imagen base64:', error);
        return null;
    }
}

// Función de manejo de errores mejorada para PostgreSQL
function handleDatabaseError(err, res, operation = 'operación de base de datos') {
    console.error(`Error en ${operation}:`, err);
    
    let statusCode = 500;
    let message = 'Error interno del servidor';
    let details = err.message;
    
    // Manejar errores específicos de PostgreSQL
    if (err.code === '23505') { // unique_violation
        if (err.constraint === 'computadores_equipo_id_key') {
            statusCode = 400;
            message = 'El ID del equipo ya existe';
            details = 'El identificador del equipo debe ser único';
        } else {
            statusCode = 400;
            message = 'Error de validación de datos';
        }
    } else if (err.code === '23514') { // check_violation
        statusCode = 400;
        message = 'Valor no válido';
        details = 'El valor proporcionado no cumple con las restricciones';
    } else if (err.code === '23502') { // not_null_violation
        statusCode = 400;
        message = 'Campo requerido faltante';
        details = `El campo ${err.column} es requerido`;
    } else if (err.code === '42P01') { // undefined_table
        statusCode = 500;
        message = 'Error de configuración';
        details = 'La tabla no existe';
    } else if (err.code === '42703') { // undefined_column
        statusCode = 400;
        message = 'Campo no válido';
        details = 'El campo especificado no existe';
    } else if (err.code === '08003') { // connection_does_not_exist
        statusCode = 500;
        message = 'Error de conexión a la base de datos';
        details = 'La conexión a la base de datos se ha perdido';
    }
    
    res.status(statusCode).json({
        error: message,
        details: details,
        code: err.code || 'UNKNOWN_ERROR'
    });
}

// RUTAS DE LA API ACTUALIZADAS PARA IMÁGENES DINÁMICAS

// Ruta de health check
app.get('/api/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        uptime: process.uptime(),
        mode: 'soporte_tecnico_imagenes_dinamicas'
    };
    
    try {
        await pool.query('SELECT NOW()');
        health.database = 'connected';
        health.status = dbInitialized ? 'ok' : 'initializing';
    } catch (err) {
        health.status = 'error';
        health.error = err.message;
        return res.status(500).json(health);
    }
    
    res.json(health);
});

// Obtener todos los computadores con filtros mejorados
app.get('/api/computadores', checkDatabase, async (req, res) => {
    try {
        console.log('📋 Obteniendo lista de computadores para soporte...');
        const { estado, responsable, equipo_id, serial_number, revisor } = req.query;
        
        let query = 'SELECT * FROM computadores WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (estado) {
            query += ` AND estado = $${paramIndex}`;
            params.push(estado);
            paramIndex++;
            console.log(`Filtro por estado: ${estado}`);
        }
        
        if (responsable) {
            query += ` AND responsable ILIKE $${paramIndex}`;
            params.push(`%${responsable}%`);
            paramIndex++;
            console.log(`Filtro por responsable: ${responsable}`);
        }
        
        if (equipo_id) {
            query += ` AND equipo_id ILIKE $${paramIndex}`;
            params.push(`%${equipo_id}%`);
            paramIndex++;
            console.log(`Filtro por equipo_id: ${equipo_id}`);
        }
        
        if (serial_number) {
            query += ` AND serial_number ILIKE $${paramIndex}`;
            params.push(`%${serial_number}%`);
            paramIndex++;
            console.log(`Filtro por serial: ${serial_number}`);
        }
        
        if (revisor) {
            query += ` AND revisor ILIKE $${paramIndex}`;
            params.push(`%${revisor}%`);
            paramIndex++;
            console.log(`Filtro por revisor: ${revisor}`);
        }
        
        query += ' ORDER BY fecha_revision DESC';
        
        console.log(`Ejecutando query: ${query} con parámetros:`, params);
        
        const result = await pool.query(query, params);
        console.log(`✅ Se encontraron ${result.rows.length} computadores`);
        res.json(result.rows);
        
    } catch (err) {
        handleDatabaseError(err, res, 'obtener computadores');
    }
});

// Obtener un computador específico
app.get('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Buscando computador con ID: ${id}`);
        
        const result = await pool.query('SELECT * FROM computadores WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            console.log(`❌ Computador con ID ${id} no encontrado`);
            return res.status(404).json({ error: 'Computador no encontrado' });
        }
        
        console.log(`✅ Computador encontrado: ${result.rows[0].equipo_id}`);
        res.json(result.rows[0]);
        
    } catch (err) {
        handleDatabaseError(err, res, 'obtener computador específico');
    }
});

// Crear nuevo registro de soporte técnico CON IMÁGENES DINÁMICAS
app.post('/api/computadores', checkDatabase, async (req, res) => {
    try {
        console.log('➕ Creando nuevo registro de soporte técnico con imágenes dinámicas...');
        console.log('Body recibido:', JSON.stringify(req.body, null, 2));
        
        const {
            equipo_id,
            serial_number,
            placa_ml,
            latitud,
            longitud,
            direccion_automatica,
            ubicacion_manual,
            responsable,
            cargo,
            estado,
            windows_update,
            observaciones,
            problemas_detectados,
            revisor,
            imagenes // Array de imágenes con title y base64
        } = req.body;
        
        // Validar campos requeridos para soporte técnico
        if (!equipo_id || !serial_number || !responsable || !cargo || !estado || !windows_update) {
            console.log('❌ Campos requeridos faltantes');
            return res.status(400).json({ 
                error: 'Campos requeridos faltantes',
                required: ['equipo_id', 'serial_number', 'responsable', 'cargo', 'estado', 'windows_update'],
                received: Object.keys(req.body)
            });
        }
        
        // Procesar imágenes dinámicas
        let imagenesJson = [];
        
        if (imagenes && Array.isArray(imagenes)) {
            console.log(`📸 Procesando ${imagenes.length} imágenes...`);
            
            for (let i = 0; i < imagenes.length; i++) {
                const imagen = imagenes[i];
                
                if (imagen.base64) {
                    const filename = processImageFromBase64(imagen.base64, `${equipo_id}-${i + 1}`);
                    
                    if (filename) {
                        imagenesJson.push({
                            title: imagen.title || `Imagen ${i + 1}`,
                            filename: filename,
                            fecha_subida: new Date().toISOString()
                        });
                        console.log(`📸 Imagen ${i + 1} procesada: ${filename}`);
                    } else {
                        console.warn(`⚠️ No se pudo procesar la imagen ${i + 1}`);
                    }
                }
            }
        }
        
        const query = `
            INSERT INTO computadores 
            (equipo_id, serial_number, placa_ml, latitud, longitud, direccion_automatica, 
             ubicacion_manual, responsable, cargo, estado, windows_update, 
             imagenes, observaciones, problemas_detectados, revisor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
        `;
        
        const params = [
            equipo_id,
            serial_number,
            placa_ml || null,
            latitud || null,
            longitud || null,
            direccion_automatica || null,
            ubicacion_manual || null,
            responsable,
            cargo,
            estado,
            windows_update,
            JSON.stringify(imagenesJson), // Guardar como JSON
            observaciones || null,
            problemas_detectados || null,
            revisor || null
        ];
        
        console.log('Ejecutando INSERT con parámetros:', params.map((p, i) => 
            i === 11 ? `[${imagenesJson.length} imágenes]` : p
        ));
        
        const result = await pool.query(query, params);
        const newId = result.rows[0].id;
        
        console.log(`✅ Registro de soporte creado con ID: ${newId} y ${imagenesJson.length} imágenes`);
        res.status(201).json({
            id: newId,
            equipo_id,
            serial_number,
            imagenes_guardadas: imagenesJson.length,
            message: 'Registro de soporte técnico creado exitosamente'
        });
        
    } catch (err) {
        handleDatabaseError(err, res, 'crear registro de soporte');
    }
});

// Actualizar registro de soporte técnico CON IMÁGENES DINÁMICAS
app.put('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`✏️ Actualizando registro de soporte ID: ${id}`);
        
        const {
            equipo_id, serial_number, placa_ml, latitud, longitud,
            direccion_automatica, ubicacion_manual, responsable, cargo,
            estado, windows_update, observaciones, problemas_detectados, revisor,
            imagenes
        } = req.body;
        
        // Procesar imágenes dinámicas para actualización
        let imagenesJson = [];
        
        if (imagenes && Array.isArray(imagenes)) {
            console.log(`📸 Actualizando con ${imagenes.length} imágenes...`);
            
            for (let i = 0; i < imagenes.length; i++) {
                const imagen = imagenes[i];
                
                if (imagen.base64) {
                    // Nueva imagen con base64
                    if (imagen.base64.startsWith('data:image')) {
                        const filename = processImageFromBase64(imagen.base64, `${equipo_id}-update-${i + 1}`);
                        
                        if (filename) {
                            imagenesJson.push({
                                title: imagen.title || `Imagen ${i + 1}`,
                                filename: filename,
                                fecha_subida: new Date().toISOString()
                            });
                            console.log(`📸 Nueva imagen ${i + 1} procesada: ${filename}`);
                        }
                    } else {
                        // Imagen existente (path del servidor)
                        const filename = imagen.base64.replace('/uploads/', '');
                        imagenesJson.push({
                            title: imagen.title || `Imagen ${i + 1}`,
                            filename: filename,
                            fecha_subida: imagen.fecha_subida || new Date().toISOString()
                        });
                        console.log(`📸 Imagen existente mantenida: ${filename}`);
                    }
                }
            }
        }
        
        const query = `
            UPDATE computadores 
            SET equipo_id = $1, serial_number = $2, placa_ml = $3, 
                latitud = $4, longitud = $5, direccion_automatica = $6, ubicacion_manual = $7,
                responsable = $8, cargo = $9, estado = $10, windows_update = $11,
                imagenes = $12,
                observaciones = $13, problemas_detectados = $14, revisor = $15,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $16
        `;
        
        const params = [
            equipo_id, serial_number, placa_ml,
            latitud, longitud, direccion_automatica, ubicacion_manual,
            responsable, cargo, estado, windows_update,
            JSON.stringify(imagenesJson),
            observaciones, problemas_detectados, revisor,
            id
        ];
        
        const result = await pool.query(query, params);
        
        if (result.rowCount === 0) {
            console.log(`❌ Registro con ID ${id} no encontrado para actualizar`);
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        
        console.log(`✅ Registro ID ${id} actualizado exitosamente con ${imagenesJson.length} imágenes`);
        res.json({ 
            message: 'Registro de soporte actualizado exitosamente',
            imagenes_guardadas: imagenesJson.length
        });
        
    } catch (err) {
        handleDatabaseError(err, res, 'actualizar registro de soporte');
    }
});

// Eliminar registro de soporte técnico
app.delete('/api/computadores/:id', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Eliminando registro de soporte ID: ${id}`);
        
        // Primero obtener las imágenes para eliminarlas
        const selectResult = await pool.query('SELECT imagenes FROM computadores WHERE id = $1', [id]);
        
        // Eliminar el registro
        const deleteResult = await pool.query('DELETE FROM computadores WHERE id = $1', [id]);
        
        if (deleteResult.rowCount === 0) {
            console.log(`❌ Registro con ID ${id} no encontrado para eliminar`);
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        
        // Eliminar archivos de imágenes si existen
        if (selectResult.rows.length > 0) {
            const row = selectResult.rows[0];
            
            if (row.imagenes && Array.isArray(row.imagenes)) {
                row.imagenes.forEach(imagen => {
                    if (imagen.filename) {
                        const filepath = path.join('uploads', imagen.filename);
                        if (fs.existsSync(filepath)) {
                            try {
                                fs.unlinkSync(filepath);
                                console.log(`🗑️ Imagen eliminada: ${filepath}`);
                            } catch (photoErr) {
                                console.error('⚠️ Error eliminando imagen:', photoErr);
                            }
                        }
                    }
                });
            }
        }
        
        console.log(`✅ Registro ID ${id} eliminado exitosamente`);
        res.json({ message: 'Registro de soporte eliminado exitosamente' });
        
    } catch (err) {
        handleDatabaseError(err, res, 'eliminar registro');
    }
});

// Obtener estadísticas de soporte técnico
app.get('/api/estadisticas', checkDatabase, async (req, res) => {
    try {
        console.log('📊 Generando estadísticas de soporte técnico...');
        
        const queries = [
            { key: 'total', sql: 'SELECT COUNT(*) as count FROM computadores' },
            { key: 'operativos', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = $1', params: ['operativo'] },
            { key: 'mantenimiento', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = $1', params: ['mantenimiento'] },
            { key: 'dañados', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = $1', params: ['dañado'] },
            { key: 'windows_si', sql: 'SELECT COUNT(*) as count FROM computadores WHERE windows_update = $1', params: ['si'] },
            { key: 'windows_no', sql: 'SELECT COUNT(*) as count FROM computadores WHERE windows_update = $1', params: ['no'] },
            { key: 'revisiones_hoy', sql: 'SELECT COUNT(*) as count FROM computadores WHERE DATE(fecha_revision) = CURRENT_DATE' },
            { key: 'con_problemas', sql: 'SELECT COUNT(*) as count FROM computadores WHERE problemas_detectados IS NOT NULL AND problemas_detectados != $1', params: [''] },
            { key: 'con_ubicacion', sql: 'SELECT COUNT(*) as count FROM computadores WHERE latitud IS NOT NULL AND longitud IS NOT NULL' },
            { key: 'con_imagenes', sql: 'SELECT COUNT(*) as count FROM computadores WHERE jsonb_array_length(imagenes) > 0' },
            { key: 'total_imagenes', sql: 'SELECT COALESCE(SUM(jsonb_array_length(imagenes)), 0) as count FROM computadores' }
        ];
        
        const stats = {};
        
        for (const { key, sql, params = [] } of queries) {
            const result = await pool.query(sql, params);
            stats[key] = result.rows[0] ? parseInt(result.rows[0].count) : 0;
        }
        
        console.log('✅ Estadísticas de soporte generadas:', stats);
        res.json(stats);
        
    } catch (err) {
        handleDatabaseError(err, res, 'obtener estadísticas de soporte');
    }
});

// Exportar datos para Excel (actualizado para imágenes dinámicas)
app.get('/api/export/excel', checkDatabase, async (req, res) => {
    try {
        console.log('📄 Exportando datos de soporte técnico para Excel...');
        
        const result = await pool.query('SELECT * FROM computadores ORDER BY fecha_revision DESC');
        
        const excelData = result.rows.map(row => {
            const imagenesInfo = row.imagenes && Array.isArray(row.imagenes) ? 
                row.imagenes.map(img => img.title).join('; ') : 'Sin imágenes';
            
            return {
                'ID EQUIPO': row.equipo_id,
                'SERIAL': row.serial_number,
                'PLACA/ML': row.placa_ml || 'NO ASIGNADO',
                'RESPONSABLE': row.responsable,
                'CARGO': row.cargo,
                'ESTADO': row.estado.toUpperCase(),
                'WINDOWS UPDATE': row.windows_update === 'si' ? 'SÍ' : 'NO',
                'UBICACIÓN': row.direccion_automatica || row.ubicacion_manual || 'NO ESPECIFICADA',
                'PROBLEMAS': row.problemas_detectados || 'NINGUNO',
                'OBSERVACIONES': row.observaciones || 'SIN OBSERVACIONES',
                'REVISOR': row.revisor || 'NO ESPECIFICADO',
                'FECHA REVISIÓN': new Date(row.fecha_revision).toLocaleDateString('es-ES'),
                'HORA REVISIÓN': new Date(row.fecha_revision).toLocaleTimeString('es-ES'),
                'CANTIDAD IMÁGENES': row.imagenes ? row.imagenes.length : 0,
                'DESCRIPCIÓN IMÁGENES': imagenesInfo
            };
        });
        
        console.log(`✅ Datos de soporte preparados para exportar: ${excelData.length} registros`);
        res.json(excelData);
        
    } catch (err) {
        handleDatabaseError(err, res, 'exportar datos de soporte');
    }
});

// Ruta para obtener información detallada de imágenes
app.get('/api/computadores/:id/imagenes', checkDatabase, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🖼️ Obteniendo imágenes del computador ID: ${id}`);
        
        const result = await pool.query('SELECT imagenes FROM computadores WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Computador no encontrado' });
        }
        
        const imagenes = result.rows[0].imagenes || [];
        
        // Agregar información adicional de cada imagen
        const imagenesConInfo = imagenes.map(imagen => {
            const filepath = path.join('uploads', imagen.filename);
            let fileInfo = {};
            
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                fileInfo = {
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    sizeFormatted: formatFileSize(stats.size)
                };
            }
            
            return {
                ...imagen,
                url: `/uploads/${imagen.filename}`,
                exists: fs.existsSync(filepath),
                ...fileInfo
            };
        });
        
        res.json(imagenesConInfo);
        
    } catch (err) {
        handleDatabaseError(err, res, 'obtener imágenes del computador');
    }
});

// Servir archivos de imagen (optimizado)
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    console.log(`🖼️ Sirviendo archivo: ${filepath}`);
    
    if (fs.existsSync(filepath)) {
        // Configurar headers para mejor rendimiento
        const stats = fs.statSync(filepath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        let contentType = 'image/jpeg';
        if (fileExtension === '.png') contentType = 'image/png';
        if (fileExtension === '.gif') contentType = 'image/gif';
        if (fileExtension === '.webp') contentType = 'image/webp';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 1 día
        res.setHeader('Last-Modified', stats.mtime.toUTCString());
        
        // Verificar si el cliente tiene una versión en cache
        const clientModified = req.headers['if-modified-since'];
        if (clientModified && new Date(clientModified) >= stats.mtime) {
            return res.status(304).end();
        }
        
        res.sendFile(filepath);
    } else {
        console.log(`❌ Archivo no encontrado: ${filepath}`);
        res.status(404).json({ error: 'Archivo no encontrado' });
    }
});

// Ruta para obtener información de imagen
app.get('/api/image-info/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        res.json({
            filename: filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            sizeFormatted: formatFileSize(stats.size)
        });
    } else {
        res.status(404).json({ error: 'Imagen no encontrada' });
    }
});

// Función auxiliar para formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Ruta principal - servir el HTML
app.get('/', (req, res) => {
    res.status(200).send('✅ API de soporte técnico funcionando correctamente.');
});

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'Archivo demasiado grande',
                details: 'El tamaño máximo permitido es 15MB por archivo'
            });
        }
    }
    
    res.status(500).json({
        error: 'Error interno del servidor',
        details: err.message,
        timestamp: new Date().toISOString()
    });
});

// Manejar rutas no encontradas
app.use('*', (req, res) => {
    console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl,
        method: req.method
    });
});

// Inicializar la aplicación
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor de soporte técnico con imágenes dinámicas...');
        
        // Inicializar base de datos
        await initializeDatabase();
        
        // Iniciar servidor
        app.listen(PORT, '0.0.0.0', () => {
            const os = require('os');
            
            // Función para obtener la IP de tu computadora
            function getLocalIP() {
                const interfaces = os.networkInterfaces();
                for (const name of Object.keys(interfaces)) {
                    for (const net of interfaces[name]) {
                        if (net.family === 'IPv4' && !net.internal) {
                            return net.address;
                        }
                    }
                }
                return 'No encontrada';
            }
            
            const miIP = getLocalIP();
            
            console.log('✅ Servidor PostgreSQL con imágenes dinámicas iniciado exitosamente');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🖥️  En tu computadora: http://localhost:4000');
            console.log(`📱 En cualquier celular: http://${miIP}:4000`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📱 INSTRUCCIONES PARA CELULARES:');
            console.log('   1. Conectar el celular a la misma WiFi');
            console.log(`   2. Abrir navegador y escribir: ${miIP}:4000`);
            console.log('   3. ¡Ya funciona! Los datos se sincronizan solos');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🐘 Base de datos: PostgreSQL');
            console.log('📷 Modo: IMÁGENES DINÁMICAS - Sin límite de fotos');
            console.log('🔗 Cada imagen puede tener su propia descripción');
            console.log('💾 Almacenamiento: Campo JSON para múltiples imágenes');
            console.log('🌐 CORS: Habilitado para todos los orígenes');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
        
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        process.exit(1);
    }
}

// Manejar cierre de la aplicación
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor de soporte técnico...');
    
    try {
        await pool.end();
        console.log('✅ Pool de conexiones PostgreSQL cerrado');
    } catch (err) {
        console.error('❌ Error al cerrar el pool de PostgreSQL:', err);
    }
    
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rechazada no manejada:', reason);
    process.exit(1);
});

// Manejar errores del pool de PostgreSQL
pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});

// Iniciar la aplicación
startServer();