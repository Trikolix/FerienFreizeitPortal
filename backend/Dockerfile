FROM php:8.3-apache

# Install PDO extensions for MySQL/PostgreSQL
RUN apt-get update && apt-get install -y libpq-dev libsqlite3-dev libpng-dev libjpeg62-turbo-dev libwebp-dev libonig-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install pdo pdo_mysql pdo_pgsql pdo_sqlite gd mbstring
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# Enable Apache mod_rewrite
RUN a2enmod rewrite headers
COPY php.ini /usr/local/etc/php/conf.d/portal.ini

# Copy backend files
COPY . /var/www/html/
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && cd /var/www/html && composer install --no-dev --no-interaction --prefer-dist

# Ensure uploads directory is writable
RUN mkdir -p /var/www/html/uploads && chown -R www-data:www-data /var/www/html/uploads

# Expose port 80
EXPOSE 80
