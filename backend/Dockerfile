FROM php:8.3-apache

# Install PDO extensions for MySQL/PostgreSQL
RUN apt-get update && apt-get install -y libpq-dev \
    && docker-php-ext-install pdo pdo_mysql pdo_pgsql

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Copy backend files
COPY . /var/www/html/

# Ensure uploads directory is writable
RUN mkdir -p /var/www/html/uploads && chown -R www-data:www-data /var/www/html/uploads

# Expose port 80
EXPOSE 80
