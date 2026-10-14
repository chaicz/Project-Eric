# Project Eric OWASP — Ruby SECURE counterpart.
require 'bcrypt'
require 'digest'
require 'erb'
require 'open3'
require 'net/http'
require 'sinatra'
require 'uri'

set :bind, '127.0.0.1'

# env-driven secrets
DB_PASSWORD = ENV.fetch('DB_PASSWORD')
LEGACY_URL  = ENV.fetch('LEGACY_URL')

# bcrypt for password hashing
def hash_password(password)
  BCrypt::Password.create(password, cost: 12)
end

# SHA-256 for fingerprinting
def fingerprint_sha256(blob)
  Digest::SHA256.hexdigest(blob)
end

# never compile a user-supplied ERB string
def render_user_template(_template_src, params)
  ERB.new('Hello <%= name %>').result_with_hash(params)
end

# Open3 with an args vector, no shell
def convert_video(filename)
  unless filename =~ /\A[\w.-]+\z/
    raise ArgumentError, 'bad filename'
  end
  _out, status = Open3.capture2('ffmpeg', '-i', filename, 'out.mp4')
  status
end

# parameterised query
def find_user(db, name)
  db[:users].where(name: name).first
end

# SSRF allowlist
ALLOWED_HOSTS = %w[cdn.example.com images.example.com]
get '/proxy' do
  uri = URI.parse(params['url'])
  unless ALLOWED_HOSTS.include?(uri.host)
    halt 400, 'blocked'
  end
  Net::HTTP.get_response(uri).body
end

# ≥ 12 chars
def is_strong?(pwd)
  pwd.is_a?(String) && pwd.length >= 12
end

# store hash, not password
post '/register' do
  DB[:users].insert(
    email:           params[:email],
    password_hash:   BCrypt::Password.create(params[:password])
  )
end

def rotate_db_password
  ENV.fetch('DB_PASSWORD_ROTATED')
end
