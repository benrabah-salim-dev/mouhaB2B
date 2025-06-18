import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import SMEKSLogoLogin  from '../assets/smeksLogo.jpg';
import axios from 'axios';

export default function LoginPage() {
  const { login } = useContext(AuthContext);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
  
      // Récupérer les données de l'utilisateur
      const userData = JSON.parse(localStorage.getItem("userData"));
  
      // Ajouter le token à axios pour l'utiliser dans les requêtes suivantes
      axios.defaults.headers.common["Authorization"] = `Bearer ${userData.token}`;
  
      // Redirection selon le rôle de l'utilisateur
      if (userData.role === "superadmin") {
        // Si superadmin, rediriger vers AgenceVoyageList
        navigate("/agence-liste");
      } else if (userData.role === "adminagence" && userData.agence_id) {
        navigate(`/agence/${userData.agence_id}/dashboard`);
      } else {
        setError("Rôle ou agence non défini");
      }
    } catch (err) {
      setError("Nom d'utilisateur ou mot de passe incorrect");
    }
  };
  

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-4">
          <img src={SMEKSLogoLogin} alt="Logo" style={{ width: '200px', height: '50px' }} />
          <h3 className="text-center mb-4">Connexion</h3>
          <form onSubmit={handleSubmit} className="p-4 border rounded shadow-sm bg-light">
            <div className="mb-3">
              <label className="form-label">Nom d'utilisateur</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Nom d'utilisateur"
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Mot de passe</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe"
                required
              />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button type="submit" className="btn btn-primary w-100">Se connecter</button>
          </form>
        </div>
      </div>
    </div>
  );
}
