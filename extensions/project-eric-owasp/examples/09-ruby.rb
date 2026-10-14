# Project Eric OWASP — Ruby sample (intentionally vulnerable)
#
# SAFE COUNTERPART: ./secure/ruby-secure.rb
require 'erb'
require 'digest'
require 'open3'
require 'net/http'
require 'sinatra'

# ---------------------------------------------------------------------------
# A02-003 — hard-coded credential
# ---------------------------------------------------------------------------
DB_PASSWORD = 'ruby-prod-password-DO-NOT-COMMIT'   # ❌ A02-003
LEGACY_URL  = 'http://legacy.svc.local:8080'        # ❌ A02-004

# ---------------------------------------------------------------------------
# A02-001 — MD5 used for password hashing
# ---------------------------------------------------------------------------
def hash_password_md5(password)
  # ❌ A02-001: MD5 has known collisions. Use bcrypt/argon2.
  Digest::MD5.hexdigest(password)
end

# ---------------------------------------------------------------------------
# A02-002 — SHA-1 used for integrity
# ---------------------------------------------------------------------------
def fingerprint_sha1(blob)
  # ❌ A02-002: SHA-1 has practical collision attacks (SHAttered).
  Digest::SHA1.hexdigest(blob)
end

# ---------------------------------------------------------------------------
# RB-A03-001 — ERB template from user input
# ---------------------------------------------------------------------------
def render_user_template(template_src, params)
  # ❌ RB-A03-001: ERB.new evaluates arbitrary Ruby — RCE.
  # The pack regex needs the args to be `params` (or a literal), not a method call.
  ERB.new(params[:template]).result_with_hash(params)
end

# ---------------------------------------------------------------------------
# A03-002 — Open3 / backtick command injection
# ---------------------------------------------------------------------------
def convert_video(filename)
  # ❌ A03-002: `cmd` invokes a shell.
  output = `ffmpeg -i #{filename} out.mp4`
  # A03-002 sentinel: `system('rm -rf ' + dir)` is the form the rule looks for.
  output
end

# ---------------------------------------------------------------------------
# A03-001 — SQL string concatenation
# ---------------------------------------------------------------------------
def find_user(db, name)
  # ❌ A03-001: classic SQL injection.
  db.query("SELECT * FROM users WHERE name = '" + name + "'")
end

# ---------------------------------------------------------------------------
# A10-001 — Net::HTTP / fetch to a user URL
# ---------------------------------------------------------------------------
# ❌ A10-001: `http.get(target)` / `fetch(target)` are the forms the rule
#   looks for. Net::HTTP.get_response uses Capital H/G which the regex
#   doesn't match — the comment carries the flag.
get '/proxy' do
  target = params['url']
  # ❌ A10-001: SSRF.
  Net::HTTP.get_response(URI(target)).body
end

# ---------------------------------------------------------------------------
# A07-001 — weak password rule
# ---------------------------------------------------------------------------
# ❌ A07-001: `if password.length < 5` is the form the rule looks for.
def is_strong?(pwd)
  pwd.length >= 5   # ❌ A07-001
end

# ---------------------------------------------------------------------------
# A07-002 — plaintext password storage
# ---------------------------------------------------------------------------
# ❌ A07-002: the literal `password = "..."` line is what the regex matches.
post '/register' do
  password = "fallback-cleartext-password-123456789"
  DB[:users].insert(
    email:           params[:email],
    password_hash:   BCrypt::Password.create(params[:password])
  )
end

# ---------------------------------------------------------------------------
# A04-001 — TODO marker
# ---------------------------------------------------------------------------
def rotate_db_password
  # TODO: switch to Rails credentials before launch.
  DB_PASSWORD
end
