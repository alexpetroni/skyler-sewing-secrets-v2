-- Site-wide settings (key-value store)
CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default maintenance mode setting
INSERT INTO site_settings (key, value) VALUES ('maintenance_mode', 'false');

-- RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Anyone can view site settings"
    ON site_settings FOR SELECT
    USING (true);

-- Only admins can update
CREATE POLICY "Admins can update site settings"
    ON site_settings FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());
