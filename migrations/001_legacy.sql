-- Baseline for fresh and existing installations. No existing rows are removed.
CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );

INSERT INTO roles (id, name, description) 
            VALUES 
                (1, 'user', 'Regular user with basic access'),
                (2, 'admin', 'Administrator with full access')
            ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role_id INTEGER DEFAULT 1 REFERENCES roles(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );

CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT,
                type VARCHAR(20) DEFAULT 'article',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );

CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );

CREATE TABLE IF NOT EXISTS course_stages (
                id SERIAL PRIMARY KEY,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                stage_number INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                UNIQUE(course_id, stage_number)
            );

CREATE TABLE IF NOT EXISTS resources (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                data JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
