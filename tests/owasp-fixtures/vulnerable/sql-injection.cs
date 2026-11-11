using System.Data.SqlClient;

public class UserRepository
{
    public User FindById(string id)
    {
        // A03: the query is built by gluing user input onto SQL text.
        var command = new SqlCommand("SELECT * FROM Users WHERE Id = '" + id + "'", _connection);
        command.ExecuteNonQuery();
        return null;
    }
}
