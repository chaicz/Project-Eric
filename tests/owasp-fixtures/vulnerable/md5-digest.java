import java.security.MessageDigest;

public class PasswordHasher {
    public static String hash(String password) throws Exception {
        // A02: MD5 is broken for password hashing.
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] digest = md.digest(password.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
