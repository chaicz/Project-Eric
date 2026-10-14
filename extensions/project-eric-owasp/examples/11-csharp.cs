// Project Eric OWASP — C# sample (intentionally vulnerable)
//
// SAFE COUNTERPART: ./secure/csharp-secure.cs

using System;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using System.Web.Mvc;

namespace VulnerableDemo
{
    public class DemoController : Controller
    {
        // -------------------------------------------------------------------
        // A02-003 — hard-coded credential
        // -------------------------------------------------------------------
        private const string DbPassword = "csharp-prod-password-NOT-SAFE-2025";
        private const string StripeKey  = "REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_EEEE";

        // A07-002 sentinel (regex form: `password = "literal-cleartext-value-12345"`)
        private const string DefaultPassword = "fallback-cleartext-password-123456789";

        // -------------------------------------------------------------------
        // A02-004 — insecure HTTP URL
        // -------------------------------------------------------------------
        private const string LegacyApi = "http://legacy.svc.local:8080/api";

        // -------------------------------------------------------------------
        // CS-A02-001 — MD5CryptoServiceProvider used for password hashing
        // -------------------------------------------------------------------
        public string HashPassword(string password)
        {
            // ❌ CS-A02-001: MD5 is broken. Use SHA256 or, for passwords,
            //                 Rfc2898DeriveBytes (PBKDF2).
            using (var md5 = new MD5CryptoServiceProvider())
            {
                var bytes = Encoding.UTF8.GetBytes(password);
                var hash  = md5.ComputeHash(bytes);
                return Convert.ToBase64String(hash);
            }
        }

        // -------------------------------------------------------------------
        // A02-001 — direct MD5 reference
        // -------------------------------------------------------------------
        public string Fingerprint(string input)
        {
            // ❌ A02-001: generic md5 use.
            using (var md5 = MD5.Create())
            {
                var bytes = Encoding.UTF8.GetBytes(input);
                var hash  = md5.ComputeHash(bytes);
                return BitConverter.ToString(hash);
            }
        }

        // -------------------------------------------------------------------
        // A07-002 — plaintext password storage
        // -------------------------------------------------------------------
        public void StoreUser(string email, string password)
        {
            using (var c = new SqlConnection($"Server=db;Database=users;Password={DbPassword}"))
            using (var cmd = c.CreateCommand())
            {
                c.Open();
                // ❌ A07-002: cleartext password lands in the users table.
                cmd.CommandText = $"INSERT INTO users(email, password) VALUES('{email}','{password}')";
                cmd.ExecuteNonQuery();
            }
        }

        // -------------------------------------------------------------------
        // A03-001 — SQL string concatenation
        // -------------------------------------------------------------------
        public void FindUser(string name)
        {
            using (var c = new SqlConnection("Server=db;Database=users"))
            using (var cmd = c.CreateCommand())
            {
                c.Open();
                // ❌ A03-001: classic SQL injection.
                cmd.CommandText = "SELECT * FROM users WHERE name = '" + name + "'";
                cmd.ExecuteReader();
            }
        }

        // -------------------------------------------------------------------
        // A03-002 — Process.Start with a shell-style string
        // -------------------------------------------------------------------
        public void ConvertVideo(string filename)
        {
            // ❌ A03-002: ; rm -rf ~ lands straight on cmd.exe.
            Process.Start("cmd.exe", "/C ffmpeg -i " + filename + " out.mp4");
        }

        // -------------------------------------------------------------------
        // A03-003 — XSS via raw HTML output
        // -------------------------------------------------------------------
        public MvcHtmlString RenderComment(string body)
        {
            // ❌ A03-003: MvcHtmlString.Create with a raw string. Always
            //              HtmlEncode first.
            return MvcHtmlString.Create("<div class='comment'>" + body + "</div>");
        }

        // -------------------------------------------------------------------
        // A10-001 — WebClient.DownloadString to user-supplied URL
        // -------------------------------------------------------------------
        // ❌ A10-001: `fetch(target)` / `http.get(target)` are the forms the
        //   rule looks for. WebClient is a similar sink in practice.
        public string ProxyAvatar(string url)
        {
            // ❌ A10-001: SSRF — url could be http://169.254.169.254/...
            using (var wc = new WebClient())
            {
                return wc.DownloadString(url);
            }
        }

        // -------------------------------------------------------------------
        // A07-001 — weak password length rule
        // -------------------------------------------------------------------
        // ❌ A07-001: `if (password.length < 5)` is the form the global rule
        //   looks for (the comment above carries the flag).
        public bool IsStrong(string pwd)
        {
            return pwd.Length >= 5;          // ❌ A07-001
        }

        // -------------------------------------------------------------------
        // A04-001 — TODO marker at a security-sensitive seam
        // -------------------------------------------------------------------
        public string RotateDbPassword()
        {
            // TODO: pull from Azure Key Vault before launch.
            return DbPassword;
        }
    }
}
