// src/components/Navbar.js
import React, { useContext } from 'react';
import { AuthContext } from '../context/(old)AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import smeksLogo from '../assets/smeksLogo.jpg';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();           
    navigate('/login'); 
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
      <div className="container">
        <img src={smeksLogo} alt="Logo" style={{ width: '40px', height: '40px' }} /> {/* Affichage du logo */}

        <span className="navbar-brand">SMEK'S</span>

        {/* Affiche rôle et éventuellement agence_id ou username */}
        {user && (
          <span className="navbar-text text-light me-3">
            Connecté en tant que : <strong>{user.role}</strong> {user.agence_id ? `(Agence ID: ${user.agence_id})` : ''}
          </span>
        )}

        {/* Bouton de navigation vers la liste des hôtels */}
        <Link to="/hotels" className="btn btn-outline-light ms-2">
          Voir les Hôtels
        </Link>

        <button className="btn btn-outline-light ms-auto" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </nav>
  );
};

export default Navbar;


//mes departs et mes arrivées