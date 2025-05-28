import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('http://localhost:8000/api/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      // Vérification de la réponse
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.detail || 'Erreur de connexion');
        return;
      }

      const data = await response.json();
      
      // Affichage de la réponse de l'API dans la console pour le débogage
      console.log('Réponse de l\'API:', data);

      // Sauvegarde des informations d'authentification dans localStorage
      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      localStorage.setItem('user_role', data.role);  // Enregistrement du rôle
      localStorage.setItem('agence_id', data.agence_id); // Sauvegarder l'ID de l'agence si disponible

      // Redirection en fonction du rôle de l'utilisateur
      if (data.role === 'superadmin') {
        navigate('/admin/dashboard');
      } else if (data.role === 'adminagence') {
        navigate(`/agence/${data.agence_id}/dashboard`);
      } else {
        setError('Rôle utilisateur non reconnu');
      }

    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      setError('Une erreur est survenue. Veuillez réessayer plus tard.');
    }
  };


  return (
    <div className="container mt-5">
      <h2>Connexion</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleLogin}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label">Nom d'utilisateur</label>
          <input
            type="text"
            id="username"
            className="form-control"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">Mot de passe</label>
          <input
            type="password"
            id="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">Se connecter</button>
      </form>
    </div>
  );
};

export default Login;
