import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import './analytics';
import { localizePageMetadata } from './page-metadata';

localizePageMetadata('app');
mount(App, { target: document.getElementById('app')! });
