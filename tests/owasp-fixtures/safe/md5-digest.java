import java.security.MessageDigest;

public class PasswordHasher {
    public static String hash(String password) throws Exception {
        // SHA-256 with a salt is acceptable for a digest.
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(password.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
