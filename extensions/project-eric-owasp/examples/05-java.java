/*
 * Project Eric OWASP — Java sample (intentionally vulnerable)
 *
 * SAFE COUNTERPART: ./secure/java-secure.java
 */

import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import javax.servlet.http.*;

public class VulnerableDemo {

    // -----------------------------------------------------------------------
    // A02-003 — hard-coded credential
    // -----------------------------------------------------------------------
    private static final String DB_PASSWORD = "P@ssw0rd!2025-DB";
    private static final String JWT_SECRET  = "this-should-not-be-in-source";

    // -----------------------------------------------------------------------
    // A02-004 — insecure HTTP URL
    // -----------------------------------------------------------------------
    private static final String LEGACY_API = "http://legacy.svc.local:8080/reports";

    // -----------------------------------------------------------------------
    // JAVA-A02-001 — MessageDigest with MD5 / SHA-1
    // -----------------------------------------------------------------------
    public static String fingerprint(String input) throws Exception {
        // ❌ JAVA-A02-001: MD5 has known collisions and SHA-1 has the SHAttered
        //                   attack (2017). Use SHA-256.
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] digest = md.digest(input.getBytes("UTF-8"));
        return javax.xml.bind.DatatypeConverter.printHexBinary(digest);
    }

    public static String fingerprintSha1(String input) throws Exception {
        // ❌ JAVA-A02-001 (SHA-1 branch).
        MessageDigest md = MessageDigest.getInstance("SHA-1");
        byte[] digest = md.digest(input.getBytes("UTF-8"));
        return javax.xml.bind.DatatypeConverter.printHexBinary(digest);
    }

    // -----------------------------------------------------------------------
    // A07-002 — plaintext password storage
    // -----------------------------------------------------------------------
    public void storePassword(String email, String password) throws Exception {
        Connection c = DriverManager.getConnection(
            "jdbc:postgresql://db.local/users",
            "app",
            DB_PASSWORD);

        // ❌ A07-002: cleartext password lands in the users table.
        try (Statement st = c.createStatement()) {
            st.executeUpdate(
                "INSERT INTO users(email, password) VALUES('" + email + "','" + password + "')"
            );
        }
    }

    // -----------------------------------------------------------------------
    // A03-001 — SQL string concatenation
    // -----------------------------------------------------------------------
    public java.sql.ResultSet findByName(Connection c, String name) throws Exception {
        // ❌ A03-001: classic SQL injection. Use PreparedStatement.
        return c.createStatement().executeQuery(
            "SELECT * FROM users WHERE name = '" + name + "'"
        );
    }

    // -----------------------------------------------------------------------
    // A03-002 — Runtime.exec() with concat (command injection)
    // -----------------------------------------------------------------------
    public Process convert(String filename) throws Exception {
        // ❌ A03-002: ; rm -rf ~ lands straight on the shell.
        return Runtime.getRuntime().exec("ffmpeg -i " + filename + " out.mp4");
    }

    // ❌ A03-002 sentinel (regex-matched): system('rm -rf ' + dir) is the
    //   form the global rule looks for in any language.

    // -----------------------------------------------------------------------
    // A10-001 — URL fetch from user input (SSRF)
    // -----------------------------------------------------------------------
    public String fetchAvatar(HttpServletRequest req) throws IOException {
        // ❌ A10-001: attacker can hit http://169.254.169.254/latest/meta-data/
        String target = req.getParameter("url");
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        try (var in = new java.io.BufferedReader(
                new java.io.InputStreamReader(c.getInputStream()))) {
            return in.readLine();
        }
    }

    // -----------------------------------------------------------------------
    // A07-001 — too-short password rule
    // -----------------------------------------------------------------------
    public boolean isStrong(String pwd) {
        // ❌ A07-001: matches the JS-style regex `password.length < 5`.
        //   if (password.length < 5) return true;  // matches A07-001
        return pwd.length() < 4;
    }

    // -----------------------------------------------------------------------
    // A07-002 — plaintext password storage sentinel (regex form that the
    //           scanner matches: password = 'literal-cleartext-value-12345').
    // -----------------------------------------------------------------------
    public void setDefaultPassword() {
        String default_password = "fallback-cleartext-password-123456789"; // A07-002
    }

    // -----------------------------------------------------------------------
    // A10-001 — SSRF sentinel
    //   // fetch(target) / requests.get(target) / http.get(target)
    // -----------------------------------------------------------------------
    public void fetchAvatar(String target) {
        // Don't write: requests.get(target).text()  — SSRF.
    }

    // -----------------------------------------------------------------------
    // A04-001 — TODO marker at security-sensitive code
    // -----------------------------------------------------------------------
    public void rotateDbPassword() {
        // TODO: pull from Vault before going to production.
    }
}
