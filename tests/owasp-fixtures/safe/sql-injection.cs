using System.Data.SqlClient;

public class UserRepository
{
    public User FindById(string id)
    {
        // The value is sent as a parameter, never concatenated.
        var command = new SqlCommand("SELECT * FROM Users WHERE Id = @id", _connection);
        command.Parameters.AddWithValue("@id", id);
        command.ExecuteNonQuery();
        return null;
    }
}
