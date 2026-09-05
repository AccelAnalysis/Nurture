export { AuthProvider, useAuth } from "../../../context/AuthContext";
export { authService } from "../../../services/authService";

// Feature owners should import authentication through this boundary rather than
// creating a second Firebase Auth client or coupling unrelated shells to the
// implementation location of AuthProvider.
