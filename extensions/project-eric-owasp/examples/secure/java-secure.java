/*
 * Project Eric OWASP — Java SECURE counterpart.
 */

import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Set;

public class SecureDemo {

    private static String dbPassword = System.getenv("DB_PASSWORD");

    // SHA-256 for integrity
    public static String fingerprint(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(input.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    // store hash, not password
    public void storeUser(String email, String password) throws Exception {
        try (Connection c = DriverManager.getConnection(
                "jdbc:postgresql://db.local/users")) {
            String hash = BCrypt.hashpw(password, BCrypt.gensalt(12));  // BCrypt import assumed
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO users(email, password_hash) VALUES (?, ?)")) {
                ps.setString(1, email);
                ps.setString(2, hash);
                ps.executeUpdate();
            }
        }
    }

    // PreparedStatement
    public ResultSet findByName(Connection c, String name) throws Exception {
        PreparedStatement ps = c.prepareStatement(
                "SELECT * FROM users WHERE name = ?");
        ps.setString(1, name);
        return ps.executeQuery();
    }

    // ProcessBuilder with an args list, no shell
    public Process convert(String filename) throws Exception {
        if (!filename.matches("[\\w.-]+")) {
            throw new IllegalArgumentException("bad filename");
        }
        return new ProcessBuilder("ffmpeg", "-i", filename, "out.mp4")
                .redirectErrorStream(true)
                .start();
    }

    // SSRF allowlist
    private static final Set<String> ALLOWED_HOSTS = Set.of("cdn.example.com");
    public String fetchAvatar(String target) throws IOException {
        java.net.URL u = new java.net.URL(target);
        if (!ALLOWED_HOSTS.contains(u.getHost())) {
            throw new IOException("blocked");
        }
        try (var in = u.openStream()) {
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    // ≥ 8 chars, server-side enforcement
    public boolean isStrong(String pwd) {
        return pwd != null && pwd.length() >= 12;
    }
}
