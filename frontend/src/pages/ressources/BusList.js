// src/BusList.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';

const BusList = () => {
    const { agence_id } = useParams();  // Récupérer l'ID de l'agence depuis l'URL
    const [buses, setBuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Récupérer les bus de l'agence via l'API Django
        axios.get(`http://127.0.0.1:8000/api/buses/?agence=${agence_id}`)
            .then(response => {
                setBuses(response.data);
                setLoading(false);
            })
            .catch(error => {
                setError('Une erreur est survenue lors de la récupération des bus.');
                setLoading(false);
            });
    }, [agence_id]);

    const handleDelete = (id) => {
        axios.delete(`http://127.0.0.1:8000/api/buses/${id}/`)
            .then(() => {
                setBuses(buses.filter(bus => bus.id !== id));
            })
            .catch(error => {
                alert('Erreur lors de la suppression');
            });
    };

    if (loading) return <div className="alert alert-info">Chargement...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div className="container mt-5">
            <h1 className="mb-4">Liste des Buses de l'Agence</h1>
            <button className="btn btn-primary mb-3">
                <Link to={`/ajouter-bus/${agence_id}`} className="text-white text-decoration-none">Ajouter un Bus</Link>
            </button>
            <table className="table table-bordered">
                <thead>
                    <tr>
                        <th>Immatriculation</th>
                        <th>Marque</th>
                        <th>Capacité</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {buses.map(bus => (
                        <tr key={bus.id}>
                            <td>{bus.immatriculation}</td>
                            <td>{bus.marque}</td>
                            <td>{bus.capacite}</td>
                            <td>
                                <button className="btn btn-danger" onClick={() => handleDelete(bus.id)}>Supprimer</button>
                                <Link to={`/modifier-bus/${bus.id}`} className="btn btn-warning ml-2">Modifier</Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default BusList;
