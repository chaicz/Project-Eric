// Project Eric OWASP — C# SECURE counterpart.

using System;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using System.Web.Mvc;

namespace SecureDemo
{
    public class DemoController : Controller
    {
        private static readonly string DbPassword = Environment.GetEnvironmentVariable("DB_PASSWORD");

        // PBKDF2 for passwords, SHA-256 for integrity
        public string HashPassword(string password)
        {
            byte[] salt = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
                rng.GetBytes(salt);

            using (var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256))
            {
                byte[] hash = pbkdf2.GetBytes(32);
                return $"v1${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
            }
        }

        public bool VerifyPassword(string password, string stored)
        {
            var parts = stored.Split('$');
            if (parts.Length != 3) return false;
            byte[] salt   = Convert.FromBase64String(parts[1]);
            byte[] expect = Convert.FromBase64String(parts[2]);
            using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
            byte[] actual = pbkdf2.GetBytes(32);
            return CryptographicOperations.FixedTimeEquals(actual, expect);
        }

        // store hash, not password
        public void StoreUser(string email, string password)
        {
            string hash = HashPassword(password);
            // INSERT users(email, password_hash) VALUES (@e, @h)
        }

        // parameterised SQL
        public void FindUser(string name) { /* SqlCommand + SqlParameter */ }

        // Process.Start with an argument vector
        public void ConvertVideo(string filename)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(filename, @"^[\w.-]+$"))
                throw new ArgumentException("bad filename");

            var psi = new ProcessStartInfo("ffmpeg", $"\"{filename}\"")
            {
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false
            };
            Process.Start(psi);
        }

        // HTML-encode output
        public MvcHtmlString RenderComment(string body)
        {
            string safe = HttpUtility.HtmlEncode(body);
            return MvcHtmlString.Create($"<div class='comment'>{safe}</div>");
        }

        // SSRF allowlist with HttpClient + host check
        private static readonly System.Collections.Generic.HashSet<string> AllowedHosts =
            new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "cdn.example.com", "images.example.com" };

        public string ProxyAvatar(string url)
        {
            var u = new Uri(url);
            if (!AllowedHosts.Contains(u.Host))
                throw new InvalidOperationException("blocked host");

            using (var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) })
                return http.GetStringAsync(u).Result;
        }

        // ≥ 12 chars
        public bool IsStrong(string pwd) => !string.IsNullOrEmpty(pwd) && pwd.Length >= 12;

        public string RotateDbPassword() => Environment.GetEnvironmentVariable("DB_PASSWORD_ROTATED");
    }
}
