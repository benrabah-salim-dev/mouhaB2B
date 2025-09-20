import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const LoginAgence = () => {
    const [login, setLogin] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const loginData = { login, mot_de_passe: motDePasse };

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/agence/login/', loginData);
            const token = response.data.access;
            localStorage.setItem('access_token', token);  // Sauvegarder le token pour l'authentification future
            navigate('/dashboard');  // Rediriger vers le tableau de bord de l'agence
        } catch (error) {
            setErrorMessage('Login ou mot de passe incorrect');
        }
    };

    return (
        <div className="container mt-5">
            <h2>Se connecter à l'agence</h2>
            {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}
            <form onSubmit={handleSubmit}>
                <div className="mb-3">
                    <label className="form-label">Login</label>
                    <input type="text" className="form-control" value={login} onChange={(e) => setLogin(e.target.value)} required />
                </div>
                <div className="mb-3">
                    <label className="form-label">Mot de passe</label>
                    <input type="password" className="form-control" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary">Se connecter</button>
            </form>
        </div>
    );
};

export default LoginAgence;
