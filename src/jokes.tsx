import React, { useEffect, useState } from 'react';

const JokeGenerator = () => {
    const [joke, setJoke] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchJoke = async () => {
        setLoading(true);
        try {
            const response = await fetch('https://v2.jokeapi.dev/joke/Any');
            const data = await response.json();
            if (data.joke) {
                setJoke(data.joke);
            } else {
                setJoke(`${data.setup} - ${data.delivery}`);
            }
        } catch (err) {
            setError('Failed to fetch joke');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJoke();
    }, []);

    return (
        <div>
            <h1>Random Joke Generator</h1>
            {loading ? <p>Loading...</p> : <p>{joke}</p>}
            {error && <p>{error}</p>}
            <button onClick={fetchJoke}>Refresh Joke</button>
        </div>
    );
};

export default JokeGenerator;