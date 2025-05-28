// src/ModifierAgence.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const ModifierAgence = () => {
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [adresse, setAdresse] = useState('');
    const [telephone, setTelephone] = useState('');
    const { agence_id } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        // Récupérer les détails de l'agence à modifier
        axios.get(`http://127.0.0.1:8000/api/agences/${agence_id}/`)
            .then(response => {
                const agence = response.data;
                setNom(agence.nom);
                setEmail(agence.email);
                setAdresse(agence.adresse);
                setTelephone(agence.telephone);
            })
            .catch(error => {
                console.error('Erreur lors de la récupération de l\'agence:', error);
            });
    }, [agence_id]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const agenceData = { nom, email, adresse, telephone };

        // Envoie des modifications à l'API Django
        axios.put(`http://127.0.0.1:8000/api/agences/${agence_id}/`, agenceData)
            .then(response => {
                navigate('/');  // Redirige vers la liste des agences après la modification
            })
            .catch(error => {
                console.error('Erreur lors de la modification de l\'agence:', error);
            });
    };

    return (
        <div>
            <h2>Modifier l'Agence de Voyage</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Nom</label>
                    <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required />
                </div>
                <div>
                    <label>Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                    <label>Adresse</label>
                    <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} required />
                </div>
                <div>
                    <label>Téléphone</label>
                    <input type="text" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
                </div>
                <button type="submit">Mettre à jour</button>
            </form>
        </div>
    );
};

export default ModifierAgence;
